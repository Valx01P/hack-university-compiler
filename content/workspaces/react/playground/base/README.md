# React playground

A real Vite + React 19 + TypeScript 7 project for trying things out, with every library the
course uses already installed and a small JSON API to fetch from. Open as playground on the
`/react` page copies that page's `App.tsx` here; otherwise you start from a counter.

## Run it

```sh
npm run dev
```

This starts the API and Vite together (`scripts/dev.ts`), with their output prefixed `[api]`
and `[web]`. The Preview shows the address Vite prints. Saving a component updates the page
without losing its state (Fast Refresh); saving any other module reloads the page.

## What is here

| Path | What it is |
| --- | --- |
| `src/App.tsx` | Your component: start here |
| `src/App.test.tsx` | One test, to copy from: render, click with user-event, assert |
| `src/main.tsx` | Renders `<App />` inside `<StrictMode>`. Add providers here |
| `src/index.css` | Base styles, light and dark |
| `src/scratch/` | Empty, for experiments |
| `src/test/setup.ts` | Runs before every test file: jest-dom's matchers and cleanup |
| `api/server.ts` | The API: `/v1/items` and `/v1/echo` |
| `api/seed.json` | The 5 items the API starts with |
| `requests.http` | Every API route with a body that works, for the API panel |
| `vite.config.ts` | React, the React Compiler, the `@/` alias for `src/`, the API proxy, and Vitest |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The API and Vite together. Ctrl+C stops both |
| `npm test` | Vitest in watch mode |
| `npm run test:run` | Every test once |
| `npm run typecheck` | `tsc -b` (the Problems panel runs it after every save too) |
| `npm run lint` | oxlint with the hooks and React Compiler rules |
| `npm run build` | Type-checks, then builds `dist/` |
| `npm run preview` | Serves `dist/` on port 4173 |
| `npm run api:reset` | Puts the 5 seed items back |

The scripts start Vite and Vitest with `--configLoader native`, so Node loads `vite.config.ts` as
TypeScript instead of Vite writing a bundled copy into `node_modules`. Add the flag if you run
`npx vite` or `npx vitest` yourself.

## The API

Vite forwards `/v1`, `/healthz`, and `/_hu` to the API, so the app fetches with plain paths:

```tsx
const response = await fetch("/v1/items");
const items: Array<{ id: number; title: string; done: boolean }> = await response.json();
```

| Method and path | Does |
| --- | --- |
| `GET /v1/items?q=&done=` | The items, filtered by title or by `done=true`/`false` |
| `POST /v1/items` | `{ title, done? }`: 201 with the new item, or a 422 problem with `errors.title` |
| `GET /v1/items/{id}` | One item, or 404 |
| `PATCH /v1/items/{id}` | `{ title?, done? }`: the changed item |
| `DELETE /v1/items/{id}` | 204 |
| `ANY /v1/echo` | Answers with the method, path, query, headers, and body it received |
| `GET /healthz` | `{ "status": "ok" }` |

Errors are RFC 9457 problems (`{ type, title, status, detail, errors? }`). Any `/v1` request may
carry `X-HU-Delay: 2000` to answer 2 seconds late, or `X-HU-Fail: 500` to fail on purpose (or
`?_delay=` and `?_fail=`), which is how to see a loading state or an error state. The data lives
in `api/data/db.json`; `npm run api:reset` restores the seed. The clock is fixed at
`2026-10-01T09:00:00Z` (`HU_FIXED_TIME`), so new items get that time.

## Adding things

**A route.** React Router is installed. In `main.tsx`:

```tsx
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

const router = createBrowserRouter([
  { path: "/", Component: App },
  { path: "/about", Component: () => <h1>About</h1> },
]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
```

**Server data.** TanStack Query is installed. Wrap the app once, then use `useQuery`:

```tsx
const queryClient = new QueryClient();
// <QueryClientProvider client={queryClient}><App /></QueryClientProvider>

const { data, isPending, error } = useQuery({
  queryKey: ["items"],
  queryFn: async ({ signal }) => (await fetch("/v1/items", { signal })).json(),
});
```

**A test.** Make `src/<Name>.test.tsx` next to the component; `npm test` finds it. To fake the
API in tests, use MSW:

```tsx
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(http.get("/v1/items", () => HttpResponse.json([{ id: 1, title: "Test", done: false }])));
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
```

**Tailwind CSS** is installed but off. In `vite.config.ts`, import `tailwindcss` from
`@tailwindcss/vite` and add `tailwindcss()` to `plugins`, then put `@import "tailwindcss";` at the
top of `src/index.css`.

**End-to-end tests**: `@playwright/test` and its Chromium are installed. Add a
`playwright.config.ts` with a `webServer` that runs `npm run dev`, specs in `e2e/`, and run
`npx playwright test`.

## Installing packages

The workspace has no internet, but `npm install` works for the packages the course names, at the
course's versions, from the local npm cache: Zustand 5.0.15, Redux Toolkit 2.13.0, Immer 11.1.21,
React Hook Form 7.90.0 with @hookform/resolvers 6.0.0, Zod 4.6.7, TanStack Router 1.170.45,
TanStack Virtual 3.14.21, and Motion 14.3.1. Name the version, as in
`npm install zustand@5.0.15 --save-exact`. Anything else fails with a "not available offline"
message.

## Resetting

The IDE's Reset puts any file, folder, or everything back as it was, and `npm run api:reset`
restores the API's items.
