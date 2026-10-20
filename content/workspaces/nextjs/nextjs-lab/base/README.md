# Trailhead Lab

A small outdoor-gear storefront built with Next.js 16 and the App Router, and the place where
you try every routing, rendering, and data idea in the course. It has no database: the catalog
and the team are TypeScript modules in `lib/`, and the slow parts of a real shop (stock levels,
reviews, shipping estimates, recommendations, deals, and an image CDN) come from a mock service
on port 4000 that answers after fixed delays. Streaming, loading states, and error boundaries
therefore behave like a real app and look the same on every run. Later in the course the same
twelve products move into a PostgreSQL database in the full store.

## Run it

The workspace starts two processes when it opens: the mock services (`npm run mock`) and the
development server (`npm run dev`). The dev server prints the address it listens on, and the
preview shows it.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with Fast Refresh. Server Component logs print here, not in the browser |
| `npm run mock` | The mock services on port 4000 (inside the workspace only) |
| `npm run build` | Production build. Prints the route table: `○` Static, `◐` Partial Prerender, `ƒ` Dynamic |
| `npm run start` | Serves the last build on `PROD_PORT` (3001 when it is not set), next to the dev server |
| `npm run routes` | Lists the routes the running dev server knows about |
| `npm run typecheck` | Generates the route types (`next typegen`), then type-checks with TypeScript 7 |
| `npm run lint` | ESLint with the Next.js rules |
| `npm test` | The `node:test` suites in `tests/`: formatting, the catalog, and the mock services |

## How the code is laid out

```text
app/                     routes: a folder is a URL segment, page.tsx makes it public
  layout.tsx             root layout: <html>, <body>, fonts, <SiteHeader>, and the footer
  page.tsx               /: hero and the first three products
  products/page.tsx      /products: every product in a grid
  about/page.tsx         /about: the team from lib/team.ts
  not-found.tsx          the 404 page for any URL that matches no route
  globals.css            Tailwind CSS and the theme tokens (brand colors, fonts)
components/              shared UI
  site-header.tsx        logo and navigation (Server Component)
  product-card.tsx       image, name, and price of one product (Server Component)
  price.tsx              formats integer cents through lib/format.ts
  counter.tsx            client component whose count shows whether its parent remounted
  feedback-box.tsx       client textarea, used to compare layouts and templates
  modal.tsx              client <dialog> that goes back when closed, for intercepted routes
lib/                     data and helpers, no UI
  catalog.ts             12 products in 4 categories, with listProducts, getProductBySlug, getCategory
  team.ts                the three people behind the shop
  format.ts              formatPrice(cents) and formatDate(iso), en-US in UTC
  inventory.ts           typed fetch helpers for the mock services
content/                 text files Server Components can read (notice.txt, about.md)
public/                  served from the site root: images, the logo, and fonts
mock/                    the mock services (server.mjs) and their data (data.json, brands/)
scripts/routes.mjs       npm run routes
tests/                   node:test suites
requests.http            one request for every mock route and control
```

```text
 browser ──> app/ (pages, layouts) ──> components/ ──> lib/catalog.ts, lib/team.ts   (module data)
                                         │
                                         └──> lib/inventory.ts ── fetch ──> mock/server.mjs :4000
```

Everything in `app/` and `components/` is a Server Component unless its file starts with
`"use client"`. Only `counter.tsx`, `feedback-box.tsx`, and `modal.tsx` do.

## How a request flows through the lab

**A page.** `GET /products` matches `app/products/page.tsx`. Next.js renders the root layout,
then the page, on the server: the page calls `listProducts()` from `lib/catalog.ts`, and each
`<ProductCard>` renders an image, a name, and a `<Price>` that formats cents with
`formatPrice`. The data is plain module data, so `next build` renders the page once ahead of
time and marks it `○` Static.

**A call to the mock services.** A component calls `getInventory("ridge-2p-tent")` from
`lib/inventory.ts`, which fetches `${MOCK_API_URL}/inventory/ridge-2p-tent`. The mock waits
600 ms and answers `{"slug":"ridge-2p-tent","stock":14,"warehouse":"Portland"}`. A 404 comes
back as `null`, which the component renders as a normal state. Any other error status throws,
so the nearest error boundary shows it. With Cache Components on, an uncached request like
this must render inside `<Suspense>` (or below a `loading.tsx`), so the rest of the page can
stream first.

## The mock services

`MOCK_API_URL` in `.env` points at `http://localhost:4000`. `GET /` on the mock lists every
route, its delay, and the overrides in effect, and `requests.http` has a request for each.

| Route | Answer | Delay |
| --- | --- | --- |
| `GET /inventory/:slug` | `{ "slug", "stock", "warehouse" }`, 404 for an unknown product | 600 ms |
| `GET /reviews/:slug/summary` | `{ "average": 4.6, "count": 27 }` (count includes ratings without text) | 900 ms |
| `GET /reviews/:slug` | the most recent written reviews, newest first. 404 when nobody has reviewed the product (Camp Kettle 1L) | 900 ms |
| `GET /shipping/:slug` | `{ "days": 3 }` | 300 ms |
| `GET /recommendations/:slug` | `{ "slug", "related": [three slugs] }` | 700 ms |
| `GET /faq` | five help center entries | 400 ms |
| `GET /deals` | three deals with sale prices in cents | 500 ms |
| `GET /team` | the same three people as `lib/team.ts` | 300 ms |
| `GET /cdn/products/<slug>.webp`, `/cdn/banners/<category>.webp`, `/cdn/brands/<brand>.png` | product photos, category banners, and the logos of Alder & Ash (`alder-and-ash`), Bluff Line, Cairn Works, Driftwood, Everpeak, and Fernway | none |

Control routes, for checks and for your own experiments:

| Route | Effect |
| --- | --- |
| `POST /__fail?path=/faq&times=1&status=500` | The next `times` calls (default 1) to `path` answer `status` (default 500). A path ending in `*` matches every path under it: `path=/inventory/*` |
| `POST /__latency?path=/faq&ms=2000` | Changes the delay for `path` (same `*` rule). Without `path` it changes every route |
| `GET /__log` | One JSON object per line for each call since the last reset: method, path, status, and start and end in milliseconds, which shows whether two calls overlapped |
| `POST /__reset` | Reloads `data.json` and clears every override, failure, and log entry |

Edit `mock/data.json`, then `POST /__reset` (or restart the mock) to serve your changes.

## The catalog

| Category | Products (slug, price) |
| --- | --- |
| Packs | `trail-pack-45` $189.00, `summit-daypack-22` $89.00, `hip-pack-5` $39.00 (out of stock) |
| Tents | `ridge-2p-tent` $349.00, `alpine-1p-tent` $279.00 (out of stock), `basecamp-4p-tent` $529.00 |
| Apparel | `storm-shell-jacket` $219.00, `merino-base-layer` $95.00, `trail-runner-cap` $28.00 |
| Cooking | `ember-stove` $64.00, `titan-pot-set` $79.00, `camp-kettle-1l` $34.00 |

Prices are integer cents (`34900` is $349.00), and dates print in `en-US` for UTC, so the
server and every browser render the same text.

## Which lessons touch what

| Files | Lessons |
| --- | --- |
| `app/page.tsx`, `app/about/page.tsx`, `lib/catalog.ts` | 1 (your first edits, server logs, and errors), 2 (new routes), 9 (the store notice from `content/notice.txt` goes at the top of the home page) |
| `app/layout.tsx`, `components/counter.tsx`, `components/feedback-box.tsx` | 3 (layouts and templates), 4 (links) |
| `app/products/page.tsx`, `components/product-card.tsx` | 5 (product and category pages), 6 (search params), 7 (route groups) |
| `components/modal.tsx` | 8 (modal routes) |
| `lib/inventory.ts`, `mock/` | 9 to 15 (server and client code, data fetching, streaming, errors), 24, 27, 28 (rendering, prerendering, instant navigation) |
| `content/about.md` | 10 (moving the client boundary) |
| `public/images/`, `components/product-card.tsx` | 36 (`next/image`: the card's plain `<img>` is the one ESLint warning in the lab) |
| `public/fonts/Fraunces.woff2`, `app/globals.css` | 37 (fonts and styles) |
| `app/layout.tsx` metadata | 38 (metadata and SEO) |
| `.env` | 39 (environment variables) |

## Good to know

- The sandbox has no internet. Fonts come from local files (`geist` and `public/fonts`), so
  `next/font/google` cannot download anything here. `npm install` works only for packages the
  image already holds.
- `allowedDevOrigins` in `next.config.ts` lets the preview reach the dev server from
  `127.0.0.1` as well as `localhost`. Without it, Next.js blocks Fast Refresh and the browser
  code of the page when it is opened at `127.0.0.1`.
- `next-env.d.ts` is generated: `next dev` points it at `.next/dev/types`, while `next build`
  and `next typegen` point it at `.next/types`. Git ignores it, and you never edit it.
- The package named `typescript` is the TypeScript 6 API, which ESLint's TypeScript parser
  and `next build`'s type check load. `npx tsc` and `npm run typecheck` run TypeScript 7
  (`@typescript/native`).
- `"overrides": { "eslint": "$eslint" }` in `package.json` lets the React, import, and
  accessibility plugins inside `eslint-config-next` use this project's ESLint 10. They work
  with it, but their package metadata still lists only ESLint 9.
- `"type": "module"` in `package.json` makes `.ts` files plain ES modules for Node, so the
  tests in `tests/` run with `node --test` and no build step.
- `public/fonts/Fraunces-OFL.txt` is the license of the Fraunces font.
