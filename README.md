# Hack University Compiler

> The Hack University online compiler, running entirely on your own machine.

Write, compile, and run **Python, JavaScript, C++, Java, and Go** right in the
browser, and query a real **PostgreSQL** database with **SQL**. Code runs in a
local [Piston](https://github.com/engineer-man/piston) sandbox in Docker, and SQL
runs on PostgreSQL 18 compiled to WebAssembly inside the page, so nothing leaves
localhost and there is no server to pay for. Same editor, same themes, same look
as the original hackuniversity.dev compiler.

## Requirements

- **Node.js 24.12+** (the workspace runner is TypeScript that Node runs directly)
- **Docker Desktop** (or any Docker engine that can run privileged containers)
- About **5 GB** of disk for the five runtimes (the C++ toolchain is 2.8 GB of it)

SQL needs none of that: it runs in the browser, so `/sql` works even with the
sandbox off.

On Apple Silicon, turn on **Settings → General → "Use Rosetta for x86_64/amd64
emulation on Apple Silicon"** in Docker Desktop. The sandbox runtimes are x86_64,
and Rosetta makes them run close to native speed.

## Quick start

```bash
git clone https://github.com/Valx01P/hack-university-compiler.git
cd hack-university-compiler
npm run up
```

That's the whole setup. `npm run up` checks for Node and Docker, installs the
dependencies, starts the code sandbox and installs its five languages,
downloads the search model, builds the TypeScript and Bash sandboxes (about
0.85 GB), builds the app, starts the workspace runner, and serves the app on
[http://localhost:3000](http://localhost:3000). The first run takes a few
minutes (the languages are about 5 GB). After that it starts in seconds, since
it skips every step that's already done. Without Docker it still serves
lessons, cheatsheets, search, and SQL, and running code says to start Docker.
Ctrl+C stops the app and the runner, and `npm run piston:down` stops the
sandbox. `npm run up -- --dev` serves the dev servers instead, for working on
the app. With [Task](https://taskfile.dev),
`task` does the same (`task --list` shows the rest).

The homepage opens the compiler you used last (Python the first time), and
every language is its own route: `/python`, `/javascript`, `/cpp`, `/java`,
`/go`, and `/sql`. The last one is a cookie (`hu-lang`) the redirect reads on
the server, so it costs nothing extra.

Only need some of the languages? Install just those yourself, then serve the
app with `npm run dev` (or `npm run build` and `npm start`):

```bash
npm run piston:up
npm run piston:install -- python javascript
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run up` | Everything: set up whatever's missing, build, and serve on `127.0.0.1:3000` (`-- --dev` for the dev server) |
| `npm run dev` | Dev server on `127.0.0.1:3000`, with the workspace runner on `127.0.0.1:3100` (restarted when its code changes) |
| `npm run build` then `npm start` | Production build and server on `127.0.0.1:3000` |
| `npm run setup` | `piston:up` + `piston:install` |
| `npm run piston:up` | Start the sandbox container on `127.0.0.1:2000` |
| `npm run piston:down` | Stop the sandbox (installed languages are kept) |
| `npm run piston:install` | Install every language, or `-- <ids>` for just some |
| `npm run piston:status` | Show which languages are installed |
| `npm run search:setup` | Download the cheatsheet search's model (30 MB, part of `setup`) |
| `npm run lessons:verify` | Check every Learn lesson in the sandbox (`-- <language> [ids]` for some) |
| `npm run challenges:verify` | Check every challenge in every language (`-- <ids>`, `--lang=<language>`) |
| `npm run reference:verify` | Lint the cheatsheets (`-- <language> [categories]`) |
| `npm run snippets:verify` | Run every code example in the lessons and cheatsheets the way the app does (`-- <languages>`, `--source=learn` or `reference`, `--pages=<ids>`) |
| `npm run sql:try -- <file.sql>` | Run SQL on a fresh PostgreSQL and print what psql would (`--setup <file.sql>`, `--sample` for the playground's tables) |
| `npm run runner` | The workspace runner alone, on `127.0.0.1:3100` ([runner/README.md](runner/README.md)) |
| `npm run images` | Build the TypeScript and Bash sandboxes when they're missing or changed (`-- bash` for one, `--force` to rebuild) |
| `npm run images:status` | Show the sandbox images and whether they're built |
| `npm run security:verify` | Prove the sandbox's isolation and limits against real containers (`-- S1 S9` for some) |
| `npm run runner:test` | The runner's tests (the ones that run real jobs skip when Docker is off) |

## Languages

| Route | Language | Runtime |
| --- | --- | --- |
| `/python` | Python 3 | Python 3.12.0 |
| `/javascript` | JavaScript | Node 20.11.1 |
| `/cpp` | C++ | GCC 10.2.0 |
| `/java` | Java | Java 15.0.2 |
| `/go` | Go | Go 1.16.2 |
| `/sql` | SQL | PostgreSQL 18.3 ([PGlite](https://pglite.dev), in the browser) |

The first five are the newest versions in Piston's package index. Piston has
packages for many more languages, see [Adding a language](#adding-a-language).

### What you can import

Every language has its whole standard library, plus the extras data structures
and algorithms practice reaches for:

| Language | Beyond the standard library |
| --- | --- |
| Python | `sortedcontainers` (SortedList, SortedDict, SortedSet), and `numpy`, `pandas`, `scipy`, `sympy` |
| JavaScript | `@datastructures-js/priority-queue` (with Min/MaxPriorityQueue), `/queue`, and `/deque`, the ones LeetCode ships |
| C++ | C++17, `bits/stdc++.h`, and GNU's policy-based `tree` (an order-statistics `ordered_set`) |
| Java | `java.util` collections, streams, `BigInteger` and `BigDecimal`, and Java 15's preview features (records, sealed classes, `instanceof` patterns) |
| Go | `container/heap`, `container/list`, `sort`, `math/big` (Go 1.16, so no generics) |

JavaScript runs as CommonJS (`require`) unless the program uses `import` or
`export`, then as an ES module, so both styles work, extras included. Programs
run with no network, so nothing is installed at run time: `npm run setup` (or
`npm run piston:install` on an existing sandbox) adds the extras once.
Compile errors and tracebacks name the file the editor shows, like
`main.py:3` or `Main.java:7`.

The badge in the top right of the compiler shows the runtime serving the
current language, or what to run if the sandbox is offline or the language
isn't installed yet.

## SQL

`/sql` is a PostgreSQL playground. Every visit starts from a small sample
database (departments, employees, customers, products, orders, and
order_items), and the database keeps every change you make until you reload
(it carries over while you switch languages), so you can create tables,
insert, update, join, and drop, and watch the results.

- **Results** shows each statement's output in order: a table for queries and
  the command tag (`CREATE TABLE`, `INSERT 0 3`, `UPDATE 2`) for everything
  else. The first error stops the script, like `psql` with `ON_ERROR_STOP`.
- **Database** lists every table and view with its columns, types, primary
  keys, and row count. Open one to preview its rows. It updates after every run.
- The reset button next to the tabs puts the sample database back.

SQL has its own Learn course, cheatsheet, and challenges (below). There, every
lesson and challenge starts from its own small tables, which show in the
**setup (runs first)** box under the editor. A check runs your query on a fresh
database for each test, and the tests change that data, so a query has to work
for any rows, not just the ones you can see.

## Learn mode

Press **Learn** above the output panel to learn the current language step by
step, from print statements through OOP, error handling, and recursion, BFS,
linked lists, trees, and graphs. Each language has its own course at
`/<language>/learn`, written for that language's idioms (memory for C++ and
Go, kwargs and decorators for Python, and so on). SQL's course goes from your
first SELECT through filtering, functions, joins, window functions, table
design, transactions, and recursive queries over linked rows, trees, and
graphs. Every course has 44 lessons: about 150 worked examples and as many
practice problems for each programming language, and 114 for SQL.

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
  parts do. When it passes, the floating **Next** glows for a few seconds, like
  the eye, to point the way on.
- The panel button at the top left shows and hides the lesson list: docked on
  the left on wide screens, sliding in as a drawer on narrower ones. Each
  lesson's parts fold out under it (the lesson you're on opens by itself). The
  list also switches languages and leads back to the compiler.
- Drag the borders to resize the lesson list, the lesson, and the editor.
  Drag the lesson list's border all the way left to fold it away, and bring it
  back with the panel button or the border.
- Every code block in a part runs too (see [Runnable examples](#runnable-examples)).
- Progress, your code in every tab, and the part you were on are saved in the
  browser's local storage. The address keeps the rest of your place: the tab
  you're on (`?tab=code` for Your code), the practice hints you've opened
  (`&hints=2`), and where you are in the part (`#example`, `#practice`,
  `#recap`), so a reload comes back to exactly that, without the page
  jumping.

Lessons live in `content/learn/<language>/` as JSON, one file per lesson.
[`content/learn/AUTHORING.md`](content/learn/AUTHORING.md) is the guide for
writing them, and `npm run lessons:verify` checks every lesson (Piston must be
running, except for SQL): it runs each example and reference solution and makes
sure every practice starter runs but doesn't already pass.

## Cheatsheets and challenges

**Cheatsheet** and **Challenges**, next to **Learn** above the output panel,
open a panel beside your code (the output moves under the editor). While it's
open the three buttons sit at the top of the panel: press the other one to
switch, or the same one again to close it. Each keeps your place, even after
you close the panel: the cheatsheet's search and scroll, the challenge list's
filters and scroll, and the challenge you're on with its hints. The address
keeps your place too (`/python?panel=cheatsheet&at=arrays`,
`?panel=challenges&challenge=greeting&hints=1`), so a reload, or a link you
copy, opens the same panel, challenge, search, and section, with the hints you
opened, the challenge list's filters (`&difficulty=easy&status=todo`), and on
SQL the database view (`&view=database`), with nothing popping in.

- **Cheatsheet**: a direct reference for the language, one section per topic
  from printing to OOP: the syntax, what to import, the methods people use, a
  loop example, and the gotchas. Search it or jump to a topic. The search goes
  by what you mean, not just the words: "list methods" finds adding,
  removing, and sorting, and "remove from a dictionary" finds a Map's delete in
  JavaScript. Each part of the cheatsheet is ranked by a small embedding model
  on this machine (word vectors distilled from a sentence transformer,
  downloaded once by `npm run setup`), together with the words themselves,
  synonyms across languages, and the topic they're under. Without the model it
  still ranks by words.
- **Challenges**: 81 short problems grouped by topic, very easy to medium, the
  same set in every language. Open one and the editor fills with its starter
  (your own code comes back when you leave it). **Check** runs it against the
  tests, and **Previous** and **Next** move through the list. Opened challenges get an eye, solved ones a
  green check. The eye next to `{}` reveals the answer, the same way as in
  Learn mode.

Content lives in `content/reference/<language>/<topic>.md` and
`content/challenges/<id>.json`, each with an `AUTHORING.md` guide, and
`npm run challenges:verify` runs every challenge's solution and starter in the
sandbox.

## Runnable examples

Every code example in the lessons and cheatsheets runs, in all six languages,
so you can tinker with it right where you read it.

- The play button at its top right (after the copy button, both always shown)
  runs it, and the output opens below (the × closes it). Every example prints
  the values its comments state, so the output shows them, and examples that
  show an error run into that error.
- Click the code (or focus it and press `Enter`) to edit it in place, and
  `Mod-Enter` runs your version. Click anywhere off the code (its buttons
  count), tab away, or press `Escape`, and it's plain code again, so nothing
  you type elsewhere lands in it.
- Once you change an example, a reset button appears before the copy button.
  Your version is saved in the browser and stays until you reset it, across
  reloads.
- SQL examples run on the lesson's tables, or on the playground's sample
  database in the cheatsheet.
- Examples show as plain highlighted code until you use them. Hovering one
  loads the editor in the background (and PostgreSQL for SQL), and clicking it
  swaps the editor in.

A fragment that can't run alone gets its context from a hidden block in the
Markdown, and C++, Java, and Go fragments are wrapped into whole programs (see
`lib/snippet-harness.mjs` and the Runnable snippets section of each
`AUTHORING.md`). `npm run snippets:verify` runs all of them, about 2,600, the
way the app does, and fails any that errors by surprise or prints nothing.

## Editor

The editor (CodeMirror) colors code with the same highlighter as the code
blocks in lessons and cheatsheets (`lib/highlight.tsx`), so code reads the same
everywhere and an example you click into keeps its colors. Escape sequences in
strings (`\n`, `\"`, SQL's `''`) get a color of their own, except in raw
strings, which have none. It also helps with nesting: brackets and quotes close
themselves, Enter between a pair opens an indented line with the closer on its
own line, each bracket pair gets a color by depth (with a stray closer marked),
indent guides and fold arrows show the blocks, and the pair at the cursor is
outlined. Go indents with tabs, everything else with spaces (2 or 4, in the
settings gear). Suggestions as you type (intellisense) have a switch there too.

**Full screen**, the corner button in the editor's toolbar (in the compiler and
in Learn), fills the window with the workspace. It's one setting for both, so
it stays on as you go between the compiler and Learn. The top bar is covered
meanwhile, so its controls float: back and forward sit beside the theme button
at the bottom right, and in Learn the lesson list button sits at the bottom
left (the list opens over the workspace) and a Compiler button joins the
editor's tabs. `Escape` leaves it (unless a menu, the lesson list, the editor's
completions, or an example you're editing take the `Escape` first), and the
address keeps it (`?full=1`), so a reload opens straight into it.

`Mod` is `Cmd` on a Mac and `Ctrl` elsewhere.

| Keys | Does |
| --- | --- |
| `Mod-F` | Find and replace (`Enter` and `Shift-Enter` move between matches) |
| `Mod-D` | Add the next match of the selection as another cursor |
| `Alt`-click, `Alt`-drag | More cursors, or a column selection |
| `Mod-/` | Comment or uncomment the line |
| `Tab`, `Shift-Tab` | Indent or outdent (`Escape` then `Tab` leaves the editor) |
| `Alt-↑`, `Alt-↓` | Move the line up or down |
| `Ctrl-Space` (or ``Alt-` `` on a Mac) | Show completions |

Completions know each language's keywords and your own names, and on an
import line they offer modules: `import col` suggests `collections`,
`from heapq import ` its functions, `#include <` the headers, `require("`
the packages, and SQL knows the sample database's tables and columns.

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

**Selection color**, under it (and in the editor's settings gear), sets the
color selected code is highlighted with in every editor, code block, and the
output: Blue until you pick another, the theme's own, Purple, Green, Amber,
Pink, Gray, or any custom color.
It's drawn at 40% over the background, so selected code keeps its syntax
colors and stays readable on dark and light editor themes, and the picker
warns you when a color would make selections hard to see. In both pickers
the custom swatch keeps the last color you picked, even after you switch to a
preset or reload: click it to bring that color back, and click it again to
change it.

**Layout lines**, at the bottom of the theme menu, is a slider for the lines
that divide the page: the panel's outline, the language rail, the lesson list
and its dividers, the editor and output boxes, the cheatsheet and challenges
panel, and the outlined buttons (Cheatsheet, Challenges, Learn, Compiler, and
Previous/Next). Slide it to 0 for a borderless page. **Content lines**, under
it, does the same for the lines inside the content, separately: tables, code
blocks and `inline code`, search boxes and dropdowns, and the dividers in
lessons, cheatsheets, challenges, and results. A focused field always shows its
border.

**Code comments**, the switch at the bottom of the theme menu, shows or hides
the comments in the code examples of lessons and cheatsheets, for reading the
code on its own (an example still prints its results when you run it). A
comment on its own line goes with its line, and copying or editing an example
leaves them out too. Code you changed yourself always shows as you wrote it.

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
  output. When a run is stopped, the reason shows above its output, and very
  long output shows its first 1,000 lines.
- SQL never reaches the server. PostgreSQL runs as WebAssembly in the page,
  loaded the first time you run SQL (about 16 MB, 5 MB gzipped). The playground
  keeps one in-memory database, and lessons and challenges get a fresh one for
  every run.
- Animations run on [GSAP](https://gsap.com): the lesson list sliding, the
  drawer, menus and popups, the cheatsheet and challenges panel, check results,
  and moving between parts. They only answer what you do, never a page load,
  and the system's "reduce motion" setting turns them off.
- Hovering or focusing a link to another page loads that page in the
  background, so it opens at once when you click. (In `npm run dev` it warms
  the page's compile instead, since Next.js only prefetches in production.)
- Saved in the browser's local storage: your code (per language), your edits
  to examples, editor zoom, tab size, intellisense, theme, editor theme,
  contrast level, code background, selection color (and the last custom
  color of each), layout lines, content lines, and code
  comments. Everything
  visual is applied before the page paints, so nothing shifts on reload, and
  the menus read what's applied, so opening one never flashes the default
  first. The editor/output split isn't saved, so
  a reload always opens on the default layout (it does carry over while you
  switch languages). The panel and the challenge you're on live in the
  address instead.

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
lib/sql/                     SQL: the PGlite playground, the sample database, and
                             the psql-style runner shared with the verifiers
lib/learn.ts                 reads courses and lessons at build time
lib/snippet-harness.mjs      turns a lesson or cheatsheet code block into a program
lib/search/                  the cheatsheet search (served by app/api/search)
lib/runtimes.json            language id to Piston runtime and package
lib/piston.ts                server-side Piston client
docker-compose.yml           the sandbox and its limits
docker/                      the TypeScript and Bash sandbox images (hu/node, hu/bash)
runner/                      the workspace runner, the only process that talks to Docker
lib/docker-memory.mjs        the one Docker memory threshold, shared by npm run up and the runner
scripts/setup-piston.mjs     runtime installer
scripts/setup-search.mjs     downloads the search model into .models/
scripts/verify-lessons.mjs   runs every lesson's programs in the sandbox
scripts/verify-challenges.mjs runs every challenge in every language
scripts/verify-reference.mjs lints the cheatsheets
scripts/verify-snippets.mjs  runs every code example in the lessons and cheatsheets
scripts/try-sql.mjs          runs SQL on a fresh PostgreSQL, printed like psql
scripts/up.mjs, dev.mjs      npm run up and npm run dev
scripts/verify-security.mjs  the sandbox's security suite
```

## Adding a language

1. `lib/runtimes.json`: the Piston runtime and package (list them with
   `curl http://127.0.0.1:2000/api/v2/packages`).
2. `lib/compiler.ts`: label, starter, file name, and `COMPILER_SLUGS`.
3. `components/compiler/lang-icon.tsx`: the rail icon.
4. `lib/highlight.tsx`: its keywords and comment style, which color its code
   blocks and editors.
5. `components/code/cm-editor.tsx` and `lib/code-editor-completions.ts`: the
   grammar for indenting, folding, and bracket matching (install the matching
   `@codemirror/lang-*` package, or use a `@codemirror/legacy-modes` mode) and
   completions.
6. `npm run piston:install -- <id>`, then run a hello world.

## Troubleshooting

- **"sandbox offline"**: start Docker Desktop, then `npm run piston:up`.
- **"isn't installed in the local sandbox yet"**: `npm run piston:install -- <id>`.
- **Slow runs on Apple Silicon**: turn on Rosetta in Docker Desktop (see
  Requirements). Java and Go compile on every run, so they take about a second
  even then.
- **Port 3000 is taken**: `PORT=3001 npm run dev`.
- **Port 3100 is taken**: another workspace runner is still up (an earlier
  `npm run up`), or set `HU_RUNNER_PORT` to another port.
- **"Start Docker to run this"** on TypeScript or Bash: start Docker Desktop.
  The runner notices within 5 seconds. **"isn't built yet"**: `npm run images`.
- **Windows**: use Docker Desktop with the WSL 2 backend.
- **Linux**: Piston needs cgroup v2 (the default on modern distros) and a
  privileged container.
- **Free the disk space**: `npm run piston:down`, then
  `docker volume rm hack-university-compiler_piston-packages`.

## Credits

- Code execution by [Piston](https://github.com/engineer-man/piston) (MIT).
- SQL by [PGlite](https://github.com/electric-sql/pglite) (Apache 2.0 and the
  PostgreSQL License).
- Animations by [GSAP](https://gsap.com) (free under its standard "no charge"
  license).
- Cheatsheet search by [Model2Vec](https://github.com/MinishLab/model2vec)'s
  [potion-base-8M](https://huggingface.co/minishlab/potion-base-8M) (MIT).
- The Java coffee cup icon is from [Devicon](https://github.com/devicons/devicon)
  (MIT). The other language icons are from [Simple Icons](https://simpleicons.org)
  (CC0).
