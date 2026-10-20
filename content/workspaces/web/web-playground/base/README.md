# Web playground

A blank but real web project: an HTML page, a stylesheet, and JavaScript modules, served by
Vite with live updates, plus a Playwright test that checks the page in Chromium. Use it to
try anything from the lessons with a terminal beside it, to add files and folders, and to
see what a build does.

## Where to start

Press **Run**. The dev server starts and the preview opens on the page. Then:

1. Open `src/main.css`, change `--bg` or the card's `border-radius`, and save. The preview
   changes without reloading, because Vite swaps the stylesheet in place.
2. Open `src/main.js`, change `greet("web")` to your name, and save. The preview reloads,
   because changed JavaScript has to run again.
3. Add a file, say `src/clock.js` with `export function now() { ... }`, import it in
   `main.js`, and save. Modules keep each file's names private until it exports them.

## What is here

| Path | What it is |
| --- | --- |
| `index.html` | The page: the viewport meta tag, the title, the stylesheet, the module script, and a card with a `<picture>` |
| `src/main.js` | The entry point: imports `greet()` and renders the greeting into `#app` |
| `src/greet.js` | One named export, to show how modules share code |
| `src/main.css` | A small reset, a few design tokens (with dark mode), and the card component |
| `public/` | Files served exactly as they are, at the site's root: `/favicon.svg`, `/images/...` |
| `public/images/` | The same picture as JPEG, WebP, and AVIF |
| `tests/smoke.spec.js` | A Playwright test: the page loads and `#app` has text |
| `vite.config.js` | The dev server's address and port (see below) |
| `playwright.config.js` | Where the tests are, the address they open, and Chromium |
| `CREDITS.md` | Where the picture and the icon come from |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server with live updates (this is what Run starts) |
| `npm run build` | Bundles the site into `dist/`: minified files with a content hash in their names, such as `assets/index-CX8hCxN8.js` |
| `npm run preview` | Serves `dist/` the way a production server would. Stop the dev server first, since both use the same port |
| `npm run test:e2e` | Runs the Playwright tests in headless Chromium (`npx playwright test` does the same) |
| `ls -la public/images` | Compares the three formats' sizes |

## How ports work here

The workspace picks a free port when it starts and passes it in the `PORT` environment
variable (`echo $PORT` shows it). `vite.config.js` reads it, and Vite prints the address
it is listening on:

```text
  VITE v8.3.4  ready in 128 ms

  ➜  Local:   http://localhost:23017/
```

That address works everywhere: in the preview, in a new browser tab, and in the terminal
(`curl -s localhost:$PORT | head`). Three settings make it work:

- `port: PORT`, so the server uses the port the workspace reserved for it.
- `strictPort: true`, so Vite stops with an error if that port is taken, instead of quietly
  moving to the next one, which the preview would not know about.
- `host: "0.0.0.0"`, so the server answers on every network interface of its container,
  not only on loopback. A server you deploy needs the same setting.

The Playwright tests open `http://localhost:$PORT` as well. When the dev server is already
running they use it, and otherwise they start one and stop it afterwards.

## The three image formats

`public/images` holds one picture, 800 by 600 pixels, saved three ways. `ls -la public/images`
shows their sizes: 32,090 bytes as JPEG, 30,672 as WebP, and 12,600 as AVIF.

The `<picture>` in `index.html` lists AVIF first, then WebP, then the JPEG in `<img>`. The
browser takes the first `<source>` whose `type` it supports and downloads only that file,
so every current browser gets the AVIF, and a browser without AVIF or WebP still gets the
JPEG. How much a format saves depends on the picture: fine grain like this one's costs WebP
almost as much as JPEG, while AVIF stays far smaller. The `width` and `height` attributes
let the browser reserve the image's space before it arrives, so nothing jumps.

## Files and resets

Your files live on your Mac, so they survive reloads and restarts. Create, rename, and
delete files in the explorer or the terminal, and the dev server notices either way. The
reset menu puts one file, one folder, or everything back the way the template has it, and
resetting everything takes a save point first, so Undo brings your version back.

The workspace has no internet. `npm install` works offline for the packages the course's
image already holds, including Vite and Playwright at the versions in `package.json`.

The scripts pass `--configLoader native` to Vite, which makes it import `vite.config.js`
directly instead of bundling it into `node_modules/.vite-temp` first. That keeps the
project working when `node_modules` is read-only, as it is in shared workspaces.
