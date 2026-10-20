# The full guide

Everything about Hack University Compiler past getting it running, which the
[README](../README.md) covers. Jump to a part:

- [Scripts](#scripts): every `npm run` command
- [Languages](#languages) and [what you can import](#what-you-can-import)
- [SQL](#sql)
- [Learn mode](#learn-mode)
- [Cheatsheets and challenges](#cheatsheets-and-challenges)
- [Runnable examples](#runnable-examples)
- [Editor](#editor): its keys and settings
- [Themes](#themes)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Adding a language](#adding-a-language)

## Scripts

| Command | What it does |
| --- | --- |
| `npm run up` | Everything: set up whatever's missing, build, and serve on `127.0.0.1:3000`. The first run asks what to install (`-- --choose` asks again, `--all`, `--minimal`, or `--only=python,web` skip the question, `--dev` serves the dev server) |
| `npm run status` | What's installed, what isn't, and how much disk each takes |
| `npm run add -- <names>` | Install compilers or courses (`python`, `cpp`, `react`, `spring`, `courses`, `all`...), after showing the size |
| `npm run remove -- <names>` | Remove them and free the disk, after showing what goes (`--dry-run` only shows it, `--with-sandbox` takes the compiler sandbox when the last compiler goes) |
| `npm run choose` | The checklist from the first run, to add and remove in one go |
| `npm run clean` | Free Docker's build cache, the course images' older builds, and untagged images |
| `npm run dev` | Dev server on `127.0.0.1:3000`, with the workspace runner on `127.0.0.1:3100` (restarted when its code changes) |
| `npm run build` then `npm start` | Production build and server on `127.0.0.1:3000` |
| `npm run setup` | `piston:up`, `piston:install` (every language), and `search:setup` |
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
| `npm run runner` | The workspace runner alone, on `127.0.0.1:3100` ([runner/README.md](../runner/README.md)) |
| `npm run images` | Build the sandbox images when they're missing or changed (`npm run add` does this for you: `-- bash` for one, `-- --stacks=express` for a course's, `--force` to rebuild) |
| `npm run images:status` | Show the sandbox images and whether they're built |
| `npm run security:verify` | Prove the sandbox's isolation and limits against real containers (`-- S1 S9` for some) |
| `npm run runner:test` | The runner's tests (the ones that run real jobs skip when Docker is off) |
| `npm run highlight:test` | Check the syntax highlighter against its snapshots in `tests/highlight/` (`UPDATE_SNAPSHOTS=1` rewrites them after a change you meant) |

## Languages

| Route | Language | Runtime |
| --- | --- | --- |
| `/python` | Python 3 | Python 3.12.0 |
| `/javascript` | JavaScript | Node 20.11.1 |
| `/cpp` | C++ | GCC 10.2.0 |
| `/java` | Java | Java 15.0.2 |
| `/go` | Go | Go 1.16.2 |
| `/sql` | SQL | PostgreSQL 18.6 ([PGlite](https://pglite.dev), in the browser) |
| `/typescript` | TypeScript | TypeScript 7.0.2 checks, then Node 26.12.0 runs it (the local runner) |
| `/bash` | Bash | Bash 5.3 (the local runner) |

Python, JavaScript, C++, Java, and Go are the newest versions in Piston's
package index. Piston has packages for many more languages, see
[Adding a language](#adding-a-language). TypeScript and Bash run on the local
runner, which needs Docker: with Docker off, their Run says "Start Docker to
run this". A type error stops a TypeScript run the way a compile error stops
C++. `/bash` has an **args** field beside stdin, split the way a shell would
(quotes keep spaces), that arrives as `$1`, `$2`, and so on.

Every course is listed once, in `content/courses.json`, the course registry:
its route, label, icon, the row of the Learn icons it sits in, and what runs it
(`piston:<id>`, `pglite`, or `runner:<recipe>`). The rail, the Learn icon rows,
the routes, `/api/execute`, and the homepage redirect all read it. Courses that
ship in a later release are already in it, without a `page`, and stay out of
sight until they get one.

The homepage opens the compiler you used last (Python the first time), and
every language is its own route: `/python`, `/javascript`, `/typescript`,
`/cpp`, `/java`, `/go`, `/sql`, and `/bash`. The last one you opened is an
HttpOnly cookie (`hu-lang`) that the compiler page asks the server to set when
you open it, and the redirect reads it on the server, so it costs nothing
extra. Hovering a link never changes it.

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
run with no network, so nothing is installed at run time: `npm run up` (or
`npm run add`) installs the extras once, with the language.
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
  idea, walk through one to three worked examples, and give you a practice
  problem with the same shape.
- The part is on the left and the editor on the right, with a tab for each
  example (Example 1 to 3 when a part has several) and **Your code**. Every
  example runs and can be edited and reset. **Check** runs your practice code
  against its tests in the sandbox.
- TypeScript and Bash parts add a little to the editor. A TypeScript run shows
  a **Type check** strip above its output: "No type errors", or each error with
  a link that puts the cursor on its line, which the editor underlines. Bash
  has an **args** field beside stdin, shows a script's exit status as a badge
  beside the output when it isn't 0, and lists the data files every run starts
  in under **files**, read only. Their checks also hold a program to its exit
  status, what it writes to stderr, and the files it leaves behind, and a
  TypeScript practice can add type tests and honesty rules (no `any`, `as`,
  non-null `!`, or `@ts-` comments).
- Stuck? The eye next to the editor's `{}` shows the answer in place of your
  code (your code is kept, and the eye closes back onto it). The first time on
  a page it asks first: click once, and again within 3 seconds while it glows.
- A part gets a green check once its practice passes, and a lesson once all its
  parts do. When it passes, the floating **Next** glows for a few seconds, like
  the eye, to point the way on.
- The panel button at the top left shows and hides the lesson list: docked on
  the left on wide screens, sliding in as a drawer on narrower ones. Each
  lesson's parts fold out under it (the lesson you're on opens by itself). The
  list also switches courses, with an icon for every course that has lessons,
  in rows of 8 (the languages first, then the web and server stacks), and
  leads back to the compiler. The icons are one stop for Tab: the arrow keys
  move between them, and Home and End jump to the ends of a row.
- Drag the borders to resize the lesson list, the lesson, and the editor.
  Drag the lesson list's border all the way left to fold it away, and bring it
  back with the panel button or the border.
- Every code block in a part runs too (see [Runnable examples](#runnable-examples)).
- Progress, your code in every tab, and the part you were on are saved in the
  browser's local storage. The address keeps the rest of your place: the tab
  you're on (`?tab=code` for Your code, `?tab=ex2` or `ex3` for the second or
  third example), the practice hints you've opened (`&hints=2`), and where you
  are in the part (`#example`, `#example-2`, `#example-3`, `#practice`,
  `#recap`), so a reload comes back to exactly that, without the page
  jumping.

Lessons live in `content/learn/<language>/` as JSON, one file per lesson.
[`content/learn/AUTHORING.md`](../content/learn/AUTHORING.md) is the guide for
writing them, and `npm run lessons:verify` checks every lesson (Piston must be
running, except for SQL): it runs each example and reference solution and makes
sure every practice starter runs but doesn't already pass. A Bash lesson's data
files live in `content/fixtures/<language>/<set>/`. To read a draft course from
outside the repo, start the app with `LEARN_CONTENT_DIR` set to its folder of
courses (the one `lessons:verify` checks) and `FIXTURES_CONTENT_DIR` to its
fixtures: a course there takes the place of the one in `content/learn/`.

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
  downloaded once by `npm run up`), together with the words themselves,
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
blocks in lessons and cheatsheets (`lib/highlight.tsx`, with its tokenizer in
`lib/tokenize.mjs`), so code reads the same everywhere and an example you click
into keeps its colors. Escape sequences in strings (`\n`, `\"`, SQL's `''`) get
a color of their own, except in raw strings, which have none. TypeScript and
TSX are read by Lezer's parser, and Bash by a scanner that reads it the way
Bash does: `a#b`, `$#`, and `${#name}` aren't comments, and a heredoc's body is
data. Python's decorators and Java's annotations are colored like calls, and
directives, the comments a tool reads (a shebang, `//go:embed`,
`// @ts-expect-error`, sqlc's `-- name:`), take the keyword color. It also
helps with nesting: brackets and quotes close themselves, Enter between a pair
opens an indented line with the closer on its own line, each bracket pair gets
a color by depth (with a stray closer marked), indent guides and fold arrows
show the blocks, and the pair at the cursor is outlined. Go indents with tabs,
everything else with spaces (2 or 4, in the settings gear). Suggestions as you
type (intellisense) have a switch there too.

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

**Layout lines**, at the top of the theme menu's right column, is a slider
for the lines that divide the page: the panel's outline, the language rail,
the lesson list and its dividers (and, in full screen, the lesson list's
edge), the compiler's editor and output boxes, the cheatsheet and challenges
panel, and Previous/Next. Slide it to 0 for a borderless page. **Content
lines**, under it, does the same for the lines inside the content,
separately: tables, code blocks and `inline code`, search boxes and
dropdowns, the dividers in lessons, cheatsheets, challenges, and results, the
Cheatsheet, Challenges, Learn, and Compiler buttons, and the Example and Your
code editor in Learn. A focused field always shows its border.

**Code comments**, a switch in the theme menu's left column, shows or hides
the comments in the code examples of lessons and cheatsheets, for reading the
code on its own (an example still prints its results when you run it). A
comment on its own line goes with its line, and copying or editing an example
leaves them out too. Directives and `TODO` lines (a starter's instructions)
always stay. Code you changed yourself always shows as you wrote it.

**Bottom shade**, the switch under it, shows or hides the shade along the
bottom of a Learn part, behind the floating Previous and Next. It spans the
whole part, the lesson, the editor, and the output, in full screen too.

**Stars**, the switch under the line sliders, puts a starry sky behind the
whole app: twinkling stars that drift slowly, and soft clouds, in the theme's
colors (yellow on Light). While it's on, the page's large backgrounds go
see-through so the sky shows behind the panels, the editors and code blocks,
the output, and the terminal. Menus, dialogs, and small controls keep their
fills. **Brightness** and **Amount** set how bright the stars are and how many
there are. **Clouds** picks one of five versions: Wisps, Swirl, Band (a river
of light across the screen), Bloom (a cluster of soft glows), or Aurora
(curtains). **Cover** sets how much cloud there is, and **Where** picks the
spot it gathers around, from the top left to the bottom right. The sky runs
at up to 30 frames a second, pauses in a hidden tab, and holds still when the
system asks for reduced motion.

## How it works

```
browser ──▶ Next.js on 127.0.0.1:3000 ──▶ /api/execute ──┬─▶ Piston on 127.0.0.1:2000 ──▶ isolate sandbox
                                                        └─▶ hu-runner on 127.0.0.1:3100 ──▶ a fresh container per run
```

- The browser never talks to Piston or the runner for a run. The Next.js
  server forwards each run to whatever the course registry says runs it, and
  the runner's answers have Piston's shape, so the output reads the same.
- They all listen on `127.0.0.1` only, so nothing else on your network can
  reach them. The API also rejects requests whose `Host` isn't localhost,
  whose `Origin` is another site, or that a page on another localhost port
  sent (a lesson's preview, say), and every write needs the app's `X-HU`
  header, so a web page you have open can't use your sandbox. The runner wants
  the token `npm run up` writes to `~/.hack-university/runner-token`.
- Every run is limited by `docker-compose.yml`: no network, 10s to run, 60s to
  compile, 512 MB of memory to run (1 GB to compile), 128 processes, and 1 MB of
  output. When a run is stopped, the reason shows above its output, and very
  long output shows its first 1,000 lines.
- SQL never reaches the server. PostgreSQL runs as WebAssembly in the page,
  loaded the first time you run SQL (about 16 MB, 5 MB gzipped). The playground
  keeps one in-memory database, and lessons and challenges get a fresh one for
  every run.
- Next.js reports each build and dev session to telemetry.nextjs.org unless
  told not to, and `npm run up` tells it not to. When you run `npm run dev`,
  `npm run build`, or `npm start` yourself, `npx next telemetry disable` turns
  it off for every Next.js project you run (`npx next telemetry status` shows
  whether it's on).
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
  color of each), layout lines, content lines, code comments, the bottom
  shade, and the stars (their brightness and amount, and the clouds'
  version, cover, and place). Everything
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
app/api/runtimes/route.ts    Piston's and the runner's health, for the status badge
app/api/lang/route.ts        sets the hu-lang cookie the homepage redirect reads
components/compiler/         the compiler: language rail, toolbar, editor, output
components/learn/            Learn mode: lesson list, lesson view, practice checks
components/chrome/           header, panel shell, status badge
components/code/             CodeMirror editor and its settings
content/learn/               the Learn courses (JSON) and the authoring guide
content/reference/           the cheatsheets (one Markdown file per topic)
content/challenges/          the challenges (one JSON file each, all languages)
content/courses.json         the course registry: every course, its row, icon, and runtime
lib/courses.ts               the registry's types and helpers
lib/compiler.ts              each compiler page's starter program
lib/sql/                     SQL: the PGlite playground, the sample database, and
                             the psql-style runner shared with the verifiers
lib/learn.ts                 reads courses and lessons at build time
lib/snippet-harness.mjs      turns a lesson or cheatsheet code block into a program
lib/tokenize.mjs             the syntax highlighter's tokenizer, for code blocks, editors, and verifiers
lib/search/                  the cheatsheet search (served by app/api/search)
lib/runtimes.json            language id to Piston runtime and package
lib/piston.ts                server-side Piston client
lib/runner.ts                server-side client for the local runner (TypeScript, Bash)
lib/single-checks.mjs        how a run passes a test, type test verdicts, and honesty
                             rules, shared with the verifiers
docker-compose.yml           the sandbox and its limits
docker/                      the sandbox images (hu/node, hu/bash, and the project courses')
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
scripts/components.mjs       npm run status, add, remove, choose, and clean
scripts/lib/components.mjs   what's installed, and installing and removing it
scripts/lib/picker.mjs       the checklist npm run up and npm run choose show
lib/components.json          everything npm run up can install, with each part's size
runner/db/pull.ts            downloads and removes the courses' database images
scripts/verify-security.mjs  the sandbox's security suite
tests/highlight/             the tokenizer's samples and snapshots, one per language
```

## Adding a language

1. `lib/runtimes.json`: the Piston runtime and package (list them with
   `curl http://127.0.0.1:2000/api/v2/packages`).
2. `lib/components.json`: an entry with its size on disk, so `npm run up` and
   `npm run add` offer it.
3. `content/courses.json`: the course, with its label, file name, icon, row,
   `"page": "single"`, `"runtime": "piston:<id>"`, and the code fences its
   snippets run in.
4. `lib/compiler.ts`: the starter program.
5. `components/compiler/lang-icon.tsx`: the icon, when it's a new one.
6. `lib/tokenize.mjs`: its keywords and comment style (or a Lezer parser, like
   TypeScript's in `lib/lezer-tokens.mjs`), which color its code blocks and
   editors, plus a sample in `tests/highlight/samples/` for
   `npm run highlight:test`.
7. `components/code/cm-editor.tsx` and `lib/code-editor-completions.ts`: the
   grammar for indenting, folding, and bracket matching (install the matching
   `@codemirror/lang-*` package, or use a `@codemirror/legacy-modes` mode) and
   completions.
8. `npm run piston:install -- <id>`, then run a hello world.
