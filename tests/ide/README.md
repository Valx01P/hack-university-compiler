# The folders' tests

The compiler's folder and the playground share these: the routes that open a
folder and proxy it to the runner, and the small libraries behind the
Explorer, the tabs, and the editors.

## Unit tests (`npm run ide:test`)

Node's test runner, with `register.mjs` loading the app's TypeScript the way
Next.js does (`@/` paths, imports without extensions, JSON modules).

| File | Covers |
| --- | --- |
| `routes.test.mjs` | `POST /api/workspaces`, the allowlisted proxy under `/api/workspaces/:id/`, and `POST /api/tickets`, against `fake-runner.mjs`: loopback Host, same origin, `Sec-Fetch-Site`, `X-HU` on writes, zod bodies, only the two scope kinds (`compiler/<course>` and `playground`), paths inside the folder, the 1 MB file cap, only the listed routes (none of the old containers'), file and folder resets only, and exactly what the runner is sent |
| `comments.test.mjs` | The Code comments switch in editors (`lib/comment-decorations.ts`): which comments hide, and a property test of random edits with comments hidden (hidden text never goes without a selection that holds visible code, and Undo restores every byte) |
| `indent.test.mjs` | Enter's indentation in every editor language (`lib/indent-rules.ts` on each grammar): a finished line keeps its level with or without its `;`, an opener goes one level in, unfinished lines stay the grammar's, and a YAML key ending its line nests the next one |
| `lib.test.mjs` | Quick open's match, names and modes, Material icon lookups, file languages, the playground's starting tree, and scopes |
| `source-file.test.mjs` | Where a Java program starts and when JavaScript runs as a module (`lib/source-file.mjs`) |

`fake-runner.mjs` is an in-memory stand-in for the runner's folder routes
and sockets, in the runner's own shapes (`runner/README.md`), with a pretend
shell that never runs anything. It lives only here. `run-fake-runner.mjs`
starts it alone, to work on the playground in a browser without the runner:
`node tests/ide/run-fake-runner.mjs --port 3413 --app-port 3410 --token dev`,
then the app with `HU_RUNNER_PORT=3413 HU_RUNNER_TOKEN=dev PORT=3410`.

## In a browser

Each script drives Chrome with `playwright-core`, which the app doesn't
install: point `PW_CORE` at a folder whose `node_modules` has it, and `CHROME`
at a Chrome or Chrome for Testing binary (or leave it out for playwright's
own). `SHOTS` is where screenshots go. They run against a production build
(`npm run build`, then `next start`) and a real runner whose WebSocket origin
is the app's port (`PORT` for the runner). The playground's terminal is a
real shell on this computer, so give that runner its own `HU_DATA_DIR` and
`HU_TMUX_SOCKET`.

| Script | Proves |
| --- | --- |
| `e2e-playground.mjs <url>` | `/playground`: the README in its tab and the rail's Playground icon, the terminal open at the bottom from the start, tabs that open and close, a file made in the terminal appearing in the Explorer with no review, an edit to a file that was there waiting for review in its own tab (Accept, and Reject putting back what was there), the terminal's border dragging and folding to its bar and opening again at its height, Mod+B folding the Explorer, Ctrl+Backquote, quick open, a reload that keeps the shell (a variable set before it) and the layout with nothing shown half restored, full screen, and a phone |
| `e2e-existing.mjs <url>` | The pages around it: a Piston run, a runner run, a Learn check, the cheatsheet's search, the rail's Playground icon from a compiler (with no Open playground left), and an old course playground's address leading to it |
| `compare-pages.mjs` | Pixel diffs of existing pages between two builds (`MINE` and `BASE` ports) |
