import { ArrowLeft, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { SignInWithFreebuff, SignOutButton, useFreebuffUser } from '@freebuff/auth/react'

import { money } from '../lib/cart'
import { cx } from '../lib/cx'
import { ORDER_STATUSES, type Order, type OrderStatus } from '../lib/orders'
import { Button, ButtonLink, Container } from '../components/ui'
import { Logo } from '../components/Nav'

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-accent-soft text-accent',
  shipped: 'bg-surface-2 text-fg',
  delivered: 'bg-fg text-bg',
  cancelled: 'bg-surface-2 text-faint',
}

const signInClass =
  'inline-flex h-12 items-center gap-2 rounded-control bg-fg px-6 text-[15px] font-medium text-bg transition-[background-color,transform] duration-200 hover:bg-[#33302b] active:scale-[0.985] [&_svg]:size-4 [&_svg]:shrink-0'
const signOutClass =
  'inline-flex h-10 items-center rounded-[12px] px-4 text-[14px] text-muted transition-colors hover:bg-surface-2 hover:text-fg'

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cx('round inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium', STATUS_BADGE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function itemCount(order: Order) {
  return order.items.reduce((count, item) => count + item.quantity, 0)
}

export function AdminHeader() {
  const { user, isLoading } = useFreebuffUser()
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="round inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-muted">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden h-9 items-center rounded-[11px] px-3 text-[14px] text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
          >
            View store
          </Link>
          {!isLoading && user && (
            <>
              {(user.name || user.email) && (
                <span className="hidden max-w-[200px] truncate text-[13px] text-muted md:block">
                  {user.name ?? user.email}
                </span>
              )}
              <SignOutButton returnTo="/admin" className={signOutClass}>
                Sign out
              </SignOutButton>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function AdminTabs() {
  const tab = 'inline-flex h-10 items-center rounded-[12px] px-4 text-[14px] transition-colors'
  return (
    <Container className="pt-10">
      <nav className="inline-flex gap-1 rounded-[16px] border border-line-strong bg-surface p-1">
        <NavLink
          end
          to="/admin"
          className={({ isActive }) => cx(tab, isActive ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}
        >
          Orders
        </NavLink>
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) => cx(tab, isActive ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/admin/newsletter"
          className={({ isActive }) => cx(tab, isActive ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}
        >
          Newsletter
        </NavLink>
      </nav>
    </Container>
  )
}

export function AdminLayout() {
  const { user, isLoading } = useFreebuffUser()

  if (isLoading) {
    return (
      <Container className="pt-16">
        <p className="text-[15px] text-muted">Checking your session…</p>
      </Container>
    )
  }

  if (!user) {
    return (
      <Container className="pt-16 pb-24">
        <div className="mx-auto max-w-md rounded-card border border-line bg-surface p-8 text-center">
          <span className="round mx-auto grid size-12 place-items-center rounded-full bg-fg text-bg">
            <Lock className="size-5" />
          </span>
          <h1 className="font-display mt-5 text-[36px]">Store admin</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Sign in with your Freebuff account to see orders and move them from pending to delivered.
          </p>
          <div className="mt-6 flex justify-center">
            <SignInWithFreebuff returnTo="/admin" className={signInClass} />
          </div>
          <ButtonLink to="/" variant="ghost" size="sm" className="mt-6">
            Back to store
          </ButtonLink>
        </div>
      </Container>
    )
  }

  return (
    <>
      <AdminTabs />
      <Outlet />
    </>
  )
}

export function AdminOrders() {
  const { refresh } = useFreebuffUser()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const response = await fetch('/api/admin/orders', { headers: { accept: 'application/json' } })
    if (response.status === 401) {
      await refresh()
      setError('Your session has expired. Sign in again.')
      setLoading(false)
      return
    }
    const body = (await response.json().catch(() => ({}))) as { orders?: Order[]; error?: string }
    if (!response.ok) {
      setError(body.error ?? 'Something went wrong.')
      setOrders(null)
      setLoading(false)
      return
    }
    setOrders(body.orders ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Container className="pt-6 pb-24">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-[13px] text-muted">Admin</p>
          <h1 className="font-display text-balance text-[36px] sm:text-[44px]">Orders</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && <p className="mt-6 text-[14px] text-accent">{error}</p>}

      <div className="mt-8 rounded-card border border-line bg-surface">
        {loading && !orders ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">Loading orders…</p>
        ) : !orders || orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">
            No orders yet. Orders placed in the shop show up here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => (
              <li key={order.reference}>
                <Link
                  to={`/admin/orders/${order.reference}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{order.email}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      <span className="font-medium text-fg">{order.reference}</span> · {formatDate(order.createdAt)} ·{' '}
                      {itemCount(order)} {itemCount(order) === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-4">
                    <span className="tabular-nums text-[15px]">{money(order.total)}</span>
                    <StatusBadge status={order.status} />
                    <ChevronRight className="size-4 text-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  )
}

export function AdminOrder() {
  const { reference } = useParams()
  const { refresh } = useFreebuffUser()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<OrderStatus | null>(null)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    if (!reference) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference!)}`, {
        headers: { accept: 'application/json' },
      })
      if (cancelled) return
      if (response.status === 401) {
        await refresh()
        if (cancelled) return
        setError('Your session has expired. Sign in again.')
        setLoading(false)
        return
      }
      const body = (await response.json().catch(() => ({}))) as { order?: Order; error?: string }
      if (cancelled) return
      if (!response.ok || !body.order) {
        setError(body.error ?? 'Something went wrong.')
        setOrder(null)
        setLoading(false)
        return
      }
      setOrder(body.order)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reference, refresh])

  async function setStatus(status: OrderStatus) {
    if (!reference) return
    setSaving(true)
    setPending(status)
    setStatusError('')
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const body = (await response.json().catch(() => ({}))) as { order?: Order; error?: string }
      if (!response.ok) {
        if (response.status === 401) await refresh()
        setStatusError(
          body.error ??
            (response.status === 403 ? 'That request was blocked. Reload the page and try again.' : 'Something went wrong.'),
        )
        return
      }
      if (body.order) setOrder(body.order)
    } catch {
      setStatusError('Could not reach the store.')
    } finally {
      setSaving(false)
      setPending(null)
    }
  }

  return (
    <Container className="pt-6 pb-24">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Orders
      </Link>

      {loading ? (
        <p className="mt-8 text-[15px] text-muted">Loading order…</p>
      ) : error || !order ? (
        <>
          <p className="font-display mt-6 text-[36px]">{error || 'Order not found.'}</p>
          <ButtonLink to="/admin" variant="secondary" className="mt-6">
            Back to orders
          </ButtonLink>
        </>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="font-display text-balance text-[36px] sm:text-[44px]">{order.reference}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-2 text-[14px] text-muted">Placed {formatDateTime(order.createdAt)}</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="rounded-card border border-line bg-surface">
                <h2 className="px-6 pt-6 text-[16px] font-medium">Items</h2>
                <ul className="divide-y divide-line px-6 pb-2">
                  {order.items.map((item) => (
                    <li key={`${item.id}-${item.option ?? ''}`} className="flex items-center gap-4 py-4">
                      <span className="image-frame relative size-16 shrink-0 rounded-[14px]">
                        <img src={item.image} alt="" className="size-full object-cover" loading="lazy" />
                        <span className="round absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-fg px-1.5 text-[11px] font-semibold tabular-nums text-bg">
                          {item.quantity}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{item.name}</span>
                        {item.option && <span className="mt-0.5 block text-[13px] text-muted">{item.option}</span>}
                      </span>
                      <span className="tabular-nums text-[15px]">{money(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 rounded-card border border-line bg-surface p-6">
                <h2 className="text-[16px] font-medium">Customer</h2>
                <p className="mt-3 text-[15px]">{order.email}</p>
              </div>
            </div>

            <div>
              <div className="rounded-card border border-line bg-surface p-6">
                <h2 className="text-[16px] font-medium">Summary</h2>
                <dl className="mt-4 flex flex-col gap-2.5 text-[15px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="tabular-nums">{money(order.subtotal)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Shipping</dt>
                    <dd className="tabular-nums">{order.shipping === 0 ? 'Free' : money(order.shipping)}</dd>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-[16px] font-medium">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{money(order.total)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6 rounded-card border border-line bg-surface p-6">
                <h2 className="text-[16px] font-medium">Status</h2>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {ORDER_STATUSES.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={order.status === status ? 'primary' : 'secondary'}
                      className="w-full"
                      disabled={saving}
                      loading={saving && pending === status}
                      onClick={() => void setStatus(status)}
                    >
                      {STATUS_LABEL[status]}
                    </Button>
                  ))}
                </div>
                {statusError && <p className="mt-3 text-[13px] text-accent">{statusError}</p>}
                <p className="mt-3 text-[13px] text-faint">Changes save immediately.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </Container>
  )
}

interface AdminStats {
  orders: number
  revenue: number
  pending: number
  subscribers: number
  last7: { day: string; orders: number; revenue: number }[]
}

export function AdminDashboard() {
  const { refresh } = useFreebuffUser()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const response = await fetch('/api/admin/stats', { headers: { accept: 'application/json' } })
      if (cancelled) return
      if (response.status === 401) {
        await refresh()
        if (cancelled) return
        setError('Your session has expired. Sign in again.')
        setLoading(false)
        return
      }
      const body = (await response.json().catch(() => ({}))) as { stats?: AdminStats; error?: string }
      if (cancelled) return
      if (!response.ok || !body.stats) {
        setError(body.error ?? 'Something went wrong.')
        setLoading(false)
        return
      }
      setStats(body.stats)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const days = stats
    ? Array.from({ length: 7 }, (_, index) => {
        const date = new Date(Date.now() - (6 - index) * 86_400_000)
        const day = date.toISOString().slice(0, 10)
        const found = stats.last7.find((entry) => entry.day === day)
        return {
          day,
          revenue: found?.revenue ?? 0,
          label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        }
      })
    : []
  const peak = Math.max(1, ...days.map((entry) => entry.revenue))

  const cards = stats
    ? [
        { label: 'Revenue', value: money(stats.revenue) },
        { label: 'Orders', value: String(stats.orders) },
        { label: 'Pending', value: String(stats.pending) },
        { label: 'Subscribers', value: String(stats.subscribers) },
      ]
    : []

  return (
    <Container className="pt-6 pb-24">
      <p className="mb-2 text-[13px] text-muted">Admin</p>
      <h1 className="font-display text-balance text-[36px] sm:text-[44px]">Dashboard</h1>

      {error && <p className="mt-6 text-[14px] text-accent">{error}</p>}

      {loading && !stats ? (
        <p className="mt-8 text-[15px] text-muted">Loading stats…</p>
      ) : stats ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="rounded-card border border-line bg-surface p-5">
                <p className="text-[13px] text-muted">{card.label}</p>
                <p className="font-display mt-2 text-[34px] tabular-nums">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-card border border-line bg-surface p-6">
            <div className="flex items-end justify-between gap-6">
              <h2 className="text-[16px] font-medium">Last 7 days</h2>
              <p className="text-[13px] text-muted">Revenue per day</p>
            </div>
            <div className="mt-6 grid grid-cols-7 gap-3">
              {days.map((entry) => (
                <div key={entry.day} className="flex flex-col items-center gap-2">
                  <span className="text-[12px] tabular-nums text-muted">
                    {entry.revenue > 0 ? money(entry.revenue) : ''}
                  </span>
                  <span className="flex h-40 w-full items-end">
                    <span
                      className="w-full rounded-t-[10px] bg-accent transition-[height] duration-500"
                      style={{ height: entry.revenue > 0 ? `${Math.max(6, Math.round((entry.revenue / peak) * 100))}%` : '0%' }}
                    />
                  </span>
                  <span className="text-[12px] text-muted">{entry.label}</span>
                </div>
              ))}
            </div>
            {stats.last7.length === 0 && (
              <p className="mt-4 text-[14px] text-faint">No orders in the last 7 days.</p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-8 text-[15px] text-muted">No stats yet.</p>
      )}
    </Container>
  )
}

export function AdminSubscribers() {
  const { refresh } = useFreebuffUser()
  const [subscribers, setSubscribers] = useState<{ email: string; createdAt: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const response = await fetch('/api/admin/subscribers', { headers: { accept: 'application/json' } })
    if (response.status === 401) {
      await refresh()
      setError('Your session has expired. Sign in again.')
      setLoading(false)
      return
    }
    const body = (await response.json().catch(() => ({}))) as {
      subscribers?: { email: string; createdAt: string }[]
      error?: string
    }
    if (!response.ok) {
      setError(body.error ?? 'Something went wrong.')
      setSubscribers(null)
      setLoading(false)
      return
    }
    setSubscribers(body.subscribers ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Container className="pt-6 pb-24">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-[13px] text-muted">Admin</p>
          <h1 className="font-display text-balance text-[36px] sm:text-[44px]">Newsletter</h1>
          {subscribers && (
            <p className="mt-2 text-[14px] text-muted">
              {subscribers.length} {subscribers.length === 1 ? 'subscriber' : 'subscribers'}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && <p className="mt-6 text-[14px] text-accent">{error}</p>}

      <div className="mt-8 rounded-card border border-line bg-surface">
        {loading && !subscribers ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">Loading subscribers…</p>
        ) : !subscribers || subscribers.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">No subscribers yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {subscribers.map((subscriber) => (
              <li
                key={subscriber.email}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <span className="min-w-0 truncate text-[15px]">{subscriber.email}</span>
                <span className="shrink-0 text-[13px] text-muted">{formatDate(subscriber.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  )
}
