# Hack University Compiler

> The Hack University online compiler, running entirely on your own machine.

Write, compile, and run **Python, JavaScript, C++, Java, and Go** right in the
browser. Code runs in a local [Piston](https://github.com/engineer-man/piston) sandbox in Docker,
so nothing leaves localhost and there is no server to pay for. Same editor, same
themes, same look as the original hackuniversity.dev compiler.

## Requirements

- **Node.js 20.9+**
- **Docker Desktop** (or any Docker engine that can run privileged containers)
- About **5 GB** of disk for the five runtimes (the C++ toolchain is 2.8 GB of it)

On Apple Silicon, turn on **Settings → General → "Use Rosetta for x86_64/amd64
emulation on Apple Silicon"** in Docker Desktop. The sandbox runtimes are x86_64,
and Rosetta makes them run close to native speed.

## Quick start

```bash
git clone https://github.com/Valx01P/hack-university-compiler.git
cd hack-university-compiler
npm install
npm run setup   # starts the sandbox and installs all five languages (one time, ~3 min)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage redirects to
the Python compiler, and every other language is its own route: `/javascript`,
`/cpp`, `/java`, and `/go`.

Only need some of them? Install just those instead of running `setup`:

```bash
npm run piston:up
npm run piston:install -- python javascript
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on `127.0.0.1:3000` |
| `npm run build` then `npm start` | Production build and server on `127.0.0.1:3000` |
| `npm run setup` | `piston:up` + `piston:install` |
| `npm run piston:up` | Start the sandbox container on `127.0.0.1:2000` |
| `npm run piston:down` | Stop the sandbox (installed languages are kept) |
| `npm run piston:install` | Install every language, or `-- <ids>` for just some |
| `npm run piston:status` | Show which languages are installed |
| `npm run lessons:verify` | Check every Learn lesson in the sandbox (`-- <language> [ids]` for some) |
| `npm run challenges:verify` | Check every challenge in all five languages (`-- <ids>`, `--lang=<language>`) |
| `npm run reference:verify` | Lint the cheatsheets (`-- <language> [categories]`) |

## Languages

| Route | Language | Runtime |
| --- | --- | --- |
| `/python` | Python 3 | Python 3.12.0 |
| `/javascript` | JavaScript | Node 20.11.1 |
| `/cpp` | C++ | GCC 10.2.0 |
| `/java` | Java | Java 15.0.2 |
| `/go` | Go | Go 1.16.2 |

These are the newest versions in Piston's package index. Piston has packages
for many more languages, see [Adding a language](#adding-a-language).

The badge in the top right of the compiler shows the runtime serving the
current language, or what to run if the sandbox is offline or the language
isn't installed yet.

## Learn mode

Press **Learn** above the output panel to learn the current language step by
step, from print statements through OOP, error handling, and recursion, BFS,
linked lists, trees, and graphs. Each language has its own course at
`/<language>/learn`, written for that language's idioms (memory for C++ and
Go, kwargs and decorators for Python, and so on). Each course has 44 lessons,
about 150 worked examples, and as many practice problems.

- Every lesson is split into parts, small sub-lessons that each explain one
  idea, walk through a worked example, and give you a practice problem with the
  same shape.
- The part is on the left and the editor on the right, with two tabs: the
  example and **Your code**. The example runs and can be edited and reset.
  **Check** runs your practice code against its tests in the sandbox.
- Stuck? The eye next to the editor's `{}` shows the answer in place of your
  code (your code is kept, and the eye closes back onto it). The first time on
  a page it asks first: click once, and again within 3 seconds while it glows.
- A part gets a green check once its practice passes, and a lesson once all its
  parts do.
- The lesson list sits on the left on wide screens, or behind the **Lessons**
  menu otherwise. Each lesson's parts fold out under it (the lesson you're on
  opens by itself). The list also switches languages and leads back to the
  compiler.
- Drag the borders to resize the lesson list, the lesson, and the editor.
  Drag the lesson list's border all the way left to fold it away, and bring it
  back with the panel button or the border.
- Progress, your code in every tab, and the part you were on are saved in the
  browser's local storage.

Lessons live in `content/learn/<language>/` as JSON, one file per lesson.
[`content/learn/AUTHORING.md`](content/learn/AUTHORING.md) is the guide for
writing them, and `npm run lessons:verify` (Piston must be running) checks every
lesson: it runs each example and reference solution in the sandbox and makes
sure every practice starter compiles but doesn't already pass.

## Reference and challenges

Press **Reference** above the output panel to open a panel beside your code
(the output moves under the editor). It has two tabs:

- **Cheatsheet**: a direct reference for the language, one section per topic
  from printing to OOP: the syntax, what to import, the methods people use, a
  loop example, and the gotchas. Search it ("append", "import", "split") or
  jump to a topic.
- **Challenges**: 81 short problems grouped by topic, very easy to medium, the
  same set in every language. Open one and the editor fills with its starter
  (your own code comes back when you leave it). **Check** runs it against the
  tests, and **Next** takes you on. Opened challenges get an eye, solved ones a
  green check. The eye next to `{}` reveals the answer, the same way as in
  Learn mode.

Content lives in `content/reference/<language>/<topic>.md` and
`content/challenges/<id>.json`, each with an `AUTHORING.md` guide, and
`npm run challenges:verify` runs every challenge's solution and starter in the
sandbox.

## Themes

Pick Light, Dark, Dracula, Monokai, Nord, or Solarized from the header. The
**Contrast** picker at the bottom of that menu (also in the editor's settings
gear, the two stay in sync) deepens whichever theme is active, both the page
and the editor:

- **Normal**: the original palettes.
- **High**: darker backgrounds, brighter text, firmer borders, and more intense
  code colors. Every theme keeps its hues but gets more saturated, and any color
  that was under 7:1 contrast gains contrast.
- **Super**: near-black (or pure white) backgrounds, the brightest text,
  borders you can't miss, near-neon code colors with more contrast than High,
  and a thicker focus ring.

Every code color stays at 4.5:1 contrast or better at every level.

Until you pick, it follows your OS "increase contrast" setting (as High).

**Code background**, below Contrast in the same menu (and in the editor's
settings gear), gives every code surface one background: the editor, the code
blocks in lessons, and the output terminal. Pick the theme's own, a dark preset
(Graphite `#2e2f34`, Navy `#1c2030`, Ink `#0d1117`, Charcoal `#1e1e1e`, Slate
`#282c34`, Black), or any custom color. The text and syntax colors stay the
editor theme's, and the picker warns you if they'd be hard to read on your
color.

## How it works

```
browser ──▶ Next.js on 127.0.0.1:3000 ──▶ /api/execute ──▶ Piston on 127.0.0.1:2000 ──▶ isolate sandbox
```

- The browser never talks to Piston. The Next.js server forwards runs to it.
- Both listen on `127.0.0.1` only, so nothing else on your network can reach
  them. The API also rejects requests whose `Host` isn't localhost or whose
  `Origin` is another site, so a web page you have open can't use your sandbox.
- Every run is limited by `docker-compose.yml`: no network, 10s to run, 60s to
  compile, 512 MB of memory to run (1 GB to compile), 128 processes, and 1 MB of
  output.
- Saved in the browser's local storage: your code (per language), editor zoom,
  tab size, intellisense, theme, editor theme, contrast level, and code
  background. Everything visual is applied before the page paints, so nothing
  shifts on reload. The editor/output split isn't saved, so a reload always
  opens on the default layout (it does carry over while you switch languages).

## Project layout

```
app/[lang]/page.tsx          one prerendered page per language
app/[lang]/learn/            Learn mode: the course shell and one page per lesson part
app/api/execute/route.ts     runs code in the sandbox
app/api/runtimes/route.ts    sandbox health and installed runtimes
components/compiler/         the compiler: language rail, toolbar, editor, output
components/learn/            Learn mode: lesson list, lesson view, practice checks
components/chrome/           header, panel shell, status badge
components/code/             CodeMirror editor and its settings
content/learn/               the Learn courses (JSON) and the authoring guide
content/reference/           the cheatsheets (one Markdown file per topic)
content/challenges/          the challenges (one JSON file each, all languages)
lib/compiler.ts              languages, labels, starters, file names
lib/learn.ts                 reads courses and lessons at build time
lib/runtimes.json            language id to Piston runtime and package
lib/piston.ts                server-side Piston client
docker-compose.yml           the sandbox and its limits
scripts/setup-piston.mjs     runtime installer
scripts/verify-lessons.mjs   runs every lesson's programs in the sandbox
scripts/verify-challenges.mjs runs every challenge in all five languages
scripts/verify-reference.mjs lints the cheatsheets
```

## Adding a language

1. `lib/runtimes.json`: the Piston runtime and package (list them with
   `curl http://127.0.0.1:2000/api/v2/packages`).
2. `lib/compiler.ts`: label, starter, file name, `COMPILER_SLUGS`, and
   `COMPILER_GROUPS`.
3. `components/compiler/lang-icon.tsx`: the rail icon.
4. `components/code/cm-editor.tsx` and `lib/code-editor-completions.ts`: syntax
   highlighting (install the matching `@codemirror/lang-*` package, or use a
   `@codemirror/legacy-modes` mode) and completions.
5. `npm run piston:install -- <id>`, then run a hello world.

## Troubleshooting

- **"sandbox offline"**: start Docker Desktop, then `npm run piston:up`.
- **"isn't installed in the local sandbox yet"**: `npm run piston:install -- <id>`.
- **Slow runs on Apple Silicon**: turn on Rosetta in Docker Desktop (see
  Requirements). Java and Go compile on every run, so they take about a second
  even then.
- **Port 3000 is taken**: `PORT=3001 npm run dev`.
- **Windows**: use Docker Desktop with the WSL 2 backend.
- **Linux**: Piston needs cgroup v2 (the default on modern distros) and a
  privileged container.
- **Free the disk space**: `npm run piston:down`, then
  `docker volume rm hack-university-compiler_piston-packages`.

## Credits

- Code execution by [Piston](https://github.com/engineer-man/piston) (MIT).
- The Java coffee cup icon is from [Devicon](https://github.com/devicons/devicon)
  (MIT). The other language icons are from [Simple Icons](https://simpleicons.org)
  (CC0).
