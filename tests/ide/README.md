# The IDE's tests

## Unit tests (`npm run ide:test`)

Node's test runner, with `register.mjs` loading the app's TypeScript the way
Next.js does (`@/` paths, imports without extensions, JSON modules).

| File | Covers |
| --- | --- |
| `routes.test.mjs` | `POST /api/workspaces`, the allowlisted proxy under `/api/workspaces/:id/`, and `POST /api/tickets`, against `fake-runner.mjs`: loopback Host, same origin, `Sec-Fetch-Site`, `X-HU` on writes, zod bodies, paths inside the workspace, the 1 MB file cap, only the listed routes and the template's tasks, and what the runner is sent |
| `comments.test.mjs` | The Code comments switch in editors (`lib/comment-decorations.ts`): which comments hide, and a property test of random edits with comments hidden (hidden text never goes without a selection that holds visible code, and Undo restores every byte) |
| `lib.test.mjs` | `.http` files, quick open's match, names and modes, Material icon lookups, file languages, starting trees, and scopes |

`fake-runner.mjs` is an in-memory stand-in for the runner's workspace routes
and sockets, in the runner's own shapes (`runner/README.md`). It lives only
here. `run-fake-runner.mjs` starts it alone, to work on the IDE in a browser
without Docker: `node tests/ide/run-fake-runner.mjs --port 3413 --app-port 3410 --token dev`,
then the app with `HU_RUNNER_PORT=3413 HU_RUNNER_TOKEN=dev PORT=3410`.

## In a browser

Each script drives Chrome with `playwright-core`, which the app doesn't
install: point `PW_CORE` at a folder whose `node_modules` has it, and `CHROME`
at a Chrome or Chrome for Testing binary. `SHOTS` is where screenshots go.
They run against a production build (`npm run build`, then `next start`) and
a real runner whose WebSocket origin is the app's port (`PORT` for the runner).

| Script | Proves |
| --- | --- |
| `e2e-playground.mjs <url> [--server code]` | `/typescript/playground`: the tree with Material icons, a file and a folder made, autosave, rename, delete, a terminal command whose file shows in the explorer within a second, a reload that brings the terminal back, the dev task's port in the preview, the API panel, a file reset and a reset of everything, and the comments switch. `--server code` writes a small HTTP server into `src/main.ts` for the dev task |
| `e2e-more.mjs <url>` | The first paint, drag to move, a conflict with the terminal, quick open, the address across a reload, full screen, and a phone |
| `e2e-learn.mjs <url>` | A Learn part in the workspace format: the fixture lesson in `fixtures/learn` (copy `fixtures/learn/typescript/*` into a `LEARN_CONTENT_DIR` copy of `content/learn/typescript`, add `playground-tour` to its `index.json`, and copy the `playground-tour` folder into the runner's `content/learn/typescript`) |
| `e2e-existing.mjs <url>` | The pages from before: a Piston run, a runner run, a Learn check, the cheatsheet's search, and Open playground |
| `compare-pages.mjs` | Pixel diffs of existing pages between two builds (`MINE` and `BASE` ports) |
