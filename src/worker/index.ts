import { createFreebuffAuth, isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

import { ORDER_STATUSES, type Order, type OrderItem, type OrderStatus } from '../app/lib/orders'
import { bySlug, FREE_SHIPPING_AT } from '../data/products'

type Env = {
  ASSETS: Fetcher
  DB: D1Database
  FREEBUFF_CLIENT_ID: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN: string
}

type AppEnv = { Bindings: Env; Variables: { user: FreebuffUser } }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_COLUMNS = 'reference, email, items, subtotal, shipping, total, status, created_at'

interface OrderRow {
  reference: string
  email: string
  items: string
  subtotal: number
  shipping: number
  total: number
  status: string
  created_at: string
}

function toOrder(row: OrderRow): Order {
  return {
    reference: row.reference,
    email: row.email,
    status: row.status as OrderStatus,
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
    createdAt: row.created_at,
    items: JSON.parse(row.items) as OrderItem[],
  }
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS orders (
    reference TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    items TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
]

let schemaReady: Promise<void> | undefined
function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= Promise.all(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement).run()))
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined
      throw error
    })
  return schemaReady
}

function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6)
  return `YS-${token.toUpperCase()}`
}

function createApp(auth: FreebuffAuth) {
  const app = new Hono<AppEnv>()

  app.get('/api/health', (c) => c.json({ ok: true }))

  // Demo checkout: the order is priced server-side against the catalogue and
  // stored in D1, so the admin site sees real orders.
  app.post('/api/orders', async (c) => {
    const body = await c.req
      .json<{ email?: string; items?: { id?: string; option?: string; quantity?: number }[] }>()
      .catch(() => null)
    if (!body?.email || !EMAIL_PATTERN.test(body.email)) return c.json({ error: 'Enter a valid email address.' }, 400)
    if (!body.items?.length) return c.json({ error: 'Your bag is empty.' }, 400)
    if (body.items.length > 100) return c.json({ error: 'That order is too large.' }, 400)

    const items: OrderItem[] = []
    for (const line of body.items) {
      const product = bySlug(String(line.id ?? ''))
      const quantity = Number(line.quantity)
      if (!product) return c.json({ error: 'One of the items is no longer available.' }, 400)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
        return c.json({ error: 'Each item needs a quantity between 1 and 99.' }, 400)
      let option: string | null = null
      if (product.options) {
        if (line.option && !product.options.values.includes(line.option))
          return c.json({ error: 'That option is no longer available.' }, 400)
        option = line.option ?? product.options.values[0] ?? null
      }
      items.push({ id: product.slug, name: product.name, option, quantity, price: product.price, image: product.image })
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const shipping = subtotal >= FREE_SHIPPING_AT ? 0 : 8
    const total = subtotal + shipping
    const createdAt = new Date().toISOString()

    const db = c.env.DB
    await ensureSchema(db)
    let reference = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      reference = newReference()
      try {
        await db
          .prepare(`INSERT INTO orders (${ORDER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(reference, body.email.trim(), JSON.stringify(items), subtotal, shipping, total, ORDER_STATUSES[0], createdAt)
          .run()
        break
      } catch (error) {
        // A colliding reference is worth one more roll, anything else is fatal.
        if (attempt === 2) throw error
      }
    }
    return c.json({ reference })
  })

  app.post('/api/newsletter', async (c) => {
    const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string })
    if (!body.email || !EMAIL_PATTERN.test(body.email)) return c.json({ error: 'Enter a valid email address.' }, 400)
    await ensureSchema(c.env.DB)
    await c.env.DB.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, created_at) VALUES (?, ?)')
      .bind(body.email.trim().toLowerCase(), new Date().toISOString())
      .run()
    return c.json({ ok: true })
  })

  // Admin: every route requires a signed-in Freebuff user and is never cached.
  const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    await next()
  }
  const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!isSameOriginRequest(c.req.raw, c.env.APP_ORIGIN)) return c.json({ error: 'Cross-origin request blocked.' }, 403)
    await next()
  }
  const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
    const user = await auth.getUser(c.req.raw)
    if (!user) return c.json({ error: 'Sign in required.' }, 401)
    c.set('user', user)
    await next()
  }

  app.get('/api/admin/orders', noStore, signedIn, async (c) => {
    await ensureSchema(c.env.DB)
    const { results } = await c.env.DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders ORDER BY created_at DESC`).all<OrderRow>()
    return c.json({ orders: results.map(toOrder) })
  })

  app.get('/api/admin/orders/:reference', noStore, signedIn, async (c) => {
    await ensureSchema(c.env.DB)
    const row = await c.env.DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE reference = ?`)
      .bind(c.req.param('reference'))
      .first<OrderRow>()
    if (!row) return c.json({ error: 'Order not found.' }, 404)
    return c.json({ order: toOrder(row) })
  })

  app.patch('/api/admin/orders/:reference', noStore, sameOrigin, signedIn, async (c) => {
    const body = await c.req.json<{ status?: string }>().catch(() => null)
    const status = body?.status
    if (!status || !ORDER_STATUSES.includes(status as OrderStatus))
      return c.json({ error: 'Unknown order status.' }, 400)

    await ensureSchema(c.env.DB)
    const reference = c.req.param('reference')
    const update = await c.env.DB.prepare('UPDATE orders SET status = ? WHERE reference = ?')
      .bind(status, reference)
      .run()
    if (update.meta.changes === 0) return c.json({ error: 'Order not found.' }, 404)

    const row = await c.env.DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE reference = ?`)
      .bind(reference)
      .first<OrderRow>()
    if (!row) return c.json({ error: 'Order not found.' }, 404)
    return c.json({ order: toOrder(row) })
  })

  // Dashboard: store-wide totals plus a 7-day series for the chart.
  app.get('/api/admin/stats', noStore, signedIn, async (c) => {
    await ensureSchema(c.env.DB)
    const db = c.env.DB
    const summary = await db
      .prepare(
        `SELECT COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending
         FROM orders`,
      )
      .first<{ orders: number; revenue: number; pending: number }>()
    // The series starts six days back so the chart always shows seven days;
    // days without orders are filled in on the client.
    const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    const daily = await db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day,
                COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS revenue
         FROM orders
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day`,
      )
      .bind(since)
      .all<{ day: string; orders: number; revenue: number }>()
    const subscribers = await db
      .prepare('SELECT COUNT(*) AS count FROM newsletter_subscribers')
      .first<{ count: number }>()
    return c.json({
      stats: {
        orders: summary?.orders ?? 0,
        revenue: summary?.revenue ?? 0,
        pending: summary?.pending ?? 0,
        subscribers: subscribers?.count ?? 0,
        last7: daily.results,
      },
    })
  })

  app.get('/api/admin/subscribers', noStore, signedIn, async (c) => {
    await ensureSchema(c.env.DB)
    const { results } = await c.env.DB.prepare(
      'SELECT email, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500',
    ).all<{ email: string; created_at: string }>()
    return c.json({ subscribers: results.map((row) => ({ email: row.email, createdAt: row.created_at })) })
  })

  // Static app last: /auth/freebuff/* is intercepted by auth.wrap before this.
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

  return app
}

let handler: ((request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>) | undefined

function buildHandler(env: Env) {
  const auth = createFreebuffAuth({
    clientId: env.FREEBUFF_CLIENT_ID,
    issuer: env.FREEBUFF_ISSUER,
    baseUrl: env.APP_ORIGIN,
    // Only relax the https requirement for local loopback development.
    allowInsecureLocalhost: env.APP_ORIGIN.startsWith('http://'),
  })
  const app = createApp(auth)
  // One auth instance per isolate: discovery and signing keys stay cached.
  return auth.wrap((request: Request, restEnv: Env, ctx: ExecutionContext) => app.fetch(request, restEnv, ctx))
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    handler ??= buildHandler(env)
    return handler(request, env, ctx)
  },
}
