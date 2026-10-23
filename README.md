# Store

An editorial storefront for a small catalogue: home page with hero, new
arrivals, categories, a lookbook section and bestsellers; a shop page with
category and price filters and sorting; product pages with options, quantity
and an accordion; a slide-out bag with free-shipping progress; and a demo
checkout with an order confirmation. The bag persists in the browser.

There is also a small backend and an admin site. The Worker validates and
prices each order against the catalogue, stores orders and newsletter
subscribers in Cloudflare D1, and exposes a session-guarded admin API. The
`/admin` screen (orders list, order detail, one-click status updates) sits
behind Sign in with Freebuff. The storefront design is unchanged.

## Run it locally

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev        # dev server + Worker + local D1, http://localhost:5173
bun run typecheck  # tsc --noEmit
bun run build      # dist/client (assets) + dist/store/index.js (Worker)
```

D1 is emulated locally (state under `.wrangler/`, git-ignored), so the whole
backend works offline with no Cloudflare account. Tables are created on first
use.

To try the admin site, open `/admin` and sign in. That needs a real Freebuff
account and an `APP_ORIGIN` your browser can reach, so it only completes end
to end once the app is deployed to Freebuff Sites. Signed-out, the admin API
still responds correctly (401 on read, 403 on cross-origin writes), so the
backend is testable without logging in.

## API

- `POST /api/orders` — validates items against the catalogue, prices the order
  server-side (free shipping over $120), stores it in D1, returns a reference.
- `POST /api/newsletter` — stores a subscriber email in D1.
- `GET /api/admin/orders`, `GET /api/admin/orders/:ref` — require a signed-in
  user, never cached.
- `PATCH /api/admin/orders/:ref` — status update; same-origin only, signed-in
  only, status revalidated server-side.

## Make it yours

- `src/data/products.ts` is the catalogue: products, categories, prices and
  copy. Images live in `public/images`.
- `src/app/pages/*` are the screens; `src/app/components/*` the pieces
  (nav, bag drawer, product card, footer, primitives).
- `src/styles.css` holds the tokens: cream canvas, ink text, a single
  terracotta accent, Instrument Serif for display type and Inter for the rest.
  Everything rounded is a squircle via `corner-shape`; true circles use `.round`.
- `src/worker/index.ts` handles `/api/orders` and `/api/newsletter`. The
  checkout is a demo: swap the order handler for a Stripe Checkout session
  (keep the secret in Sites → Secrets) or save orders to D1.

## Deploy with Freebuff Sites

`deploy.json` points at the build output. After `bun run build`, deploy with
the `sites_deploy` tool from this directory.
