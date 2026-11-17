# Hack University Compiler, conventions for agents

The downloadable Hack University app: compilers, Learn mode, cheatsheets,
challenges, and project courses in an IDE, all running on the learner's own
computer. The README is for learners (short on purpose), `docs/guide.md` is
the full tour of features and scripts, and this file is how the app is meant
to look and behave, so a change keeps its patterns. The owner decided
everything below by trying it live, so don't re-propose what's listed as
rejected, and when a new idea changes how something looks, show it running
before committing it.

## Ground rules

- **Local only.** Nothing leaves localhost: Piston binds `127.0.0.1:2000`
  (never change it to `0.0.0.0`), the runner `127.0.0.1:3100`, the app
  `127.0.0.1:3000`, and Next.js telemetry stays off. No accounts, no analytics,
  no network calls at run time.
- **Commits:** one line, all lowercase, `type(scope): summary`, no body, no
  em dashes or semicolons, and no co-author or tool trailers. The author is
  Pablo Valdes <pablovaldes0925@gmail.com>.
- **Before pushing:** build the commit in a clean git worktree
  (`npm ci && npm run build`, which runs the prebuild that writes
  `.generated/`). To type-check in a worktree, run `npx next typegen` first.
- **Never run prettier.** There's no formatter config, and lines are wrapped
  by hand, wider than prettier would.
- **Don't disturb a working sandbox.** Never stop or recreate the `hu-piston`
  container (`docker compose up` can recreate it when its config drifted, so
  test `npm run up` with `--minimal`, or with Docker unreachable, and test
  removals with `--dry-run`).
- **Platforms: Mac and Windows** (Docker Desktop, with WSL 2 on Windows).
  Never tested on a real Windows PC yet, so keep these from the Windows
  audit: `.gitattributes` (LF everywhere, files run in Linux containers);
  npm through `npmCommand` (Node runs npm-cli.js, no `npm.cmd` shell) and
  Next.js started by Node directly (`serveApp`); `node` and `docker` spawned
  without a shell; `import.meta.dirname`, never a URL's pathname; path checks
  with `path.sep`, never a literal `/`; tar modes fixed for Linux on Windows
  (`linuxMode` in `runner/tar.ts`) and modes ignored as changes there
  (`WINDOWS` in `runner/storage/host.ts`); exec stdin by byte count on
  Windows, since its named pipes can't half-close (`STDIN_BY_COUNT` in
  `runner/jobs.ts`, `HU_STDIN_BY_COUNT=1` runs it in the tests); fixtures'
  links and exec bits from git's record (`windowsGitModes`); and the runner
  asked to shut down over IPC, never killed, on Windows.
- **Docs stay short where learners read them.** The README is the install
  steps, written for someone who has never opened a terminal (numbered, per
  computer, every command copyable), and the everyday commands. Details go in
  `docs/guide.md`.

## What the app is

- **The compiler page is the online compiler first:** the language rail, the
  editor, stdin, Run, and the output. Nothing else shows by default. The
  Cheatsheet and Challenges buttons open a panel beside the code, and Learn
  opens Learn mode. Never add notes, AI, or other panels to the page.
- **Teaching lives in Learn mode** (`/<lang>/learn/<lesson>/<part>`): the part
  on the left, the editor on the right, each lesson split into parts with one
  idea, one to three worked examples, and a practice with the same shape.
  Never test what wasn't taught, and write each course in its language's
  idioms.
- Python, JavaScript, C++, Java, and Go run on Piston. SQL runs on PGlite in
  the page. TypeScript and Bash run on the local runner. The project courses
  (web, React, Next.js, Express, FastAPI, Spring Boot, Go APIs) open real
  codebases in the IDE.
- **Every example runs.** Every code block in lessons and cheatsheets has to
  pass `npm run snippets:verify`. Give a fragment context with hidden harness
  or stdin fences rather than changing what readers see.
- **What's installed is the learner's choice.** `npm run up` shows a checklist
  with every part's size, and `npm run add`, `remove`, `status`, `choose`, and
  `clean` change it later. In the app, anything not installed says its size
  and the exact command to add it.

## Look

- **The original Hack University look:** the wordmark header, the bordered
  panel with its bar, and the design tokens in `app/globals.css`. Every color
  is a token, and a new look has to fit the existing system, not start its
  own.
- **Six themes** (Light, Dark, Dracula, Monokai, Nord, Solarized), each paired
  with a code theme (Light with GitHub Light, Dark with Midnight, the rest
  their own), and the code theme can be picked separately.
- **Contrast levels** (Normal, High, Super) mean more intense colors
  everywhere, syntax included, in each theme's own hues: High is 7:1 or
  better on every token, Super more saturated still, nothing under 4.5:1.
  Pastel "high contrast" was rejected.
- **Line sliders fade only lines,** never fills. Layout lines are the
  structure (the panel, the rail, sidebars and dividers, the editor and
  output boxes, the full-screen lesson drawer). Content lines are inside the
  content (tables, code blocks and inline code, fields, dividers in lessons
  and results, the Cheatsheet, Challenges, Learn, and Compiler buttons, and
  Learn's editor box). A focused field always shows its border.
- **Code background and selection color** apply to every editor, code block,
  and output. Selection defaults to Blue (`#388bfd`) at 40% over the
  background, and it's every selection in the app, page text included (one
  `--code-selection`, the text keeping its colors), never the accent. There's
  one selection on the page at a time: an editor's shows only while it has
  focus. Each picker warns about unreadable choices, and its custom swatch
  remembers the last custom color.
- **The defaults,** for a first visit with nothing saved: Dark, Super
  contrast, the theme's own code background, Blue selection, comments and the
  bottom shade shown, tooltips, border highlights, and scrollbars hidden, both
  line sliders off, and the stars on (70% brightness, 50% amount, wisps at the
  top at 50% cover), and the editors on Midnight at 15px, tab size 4, with
  intellisense and matching brackets on. A setting is stored only when it
  differs from its default, so changing a default means storing the old one by
  name (like `hu-stars=off`), and the bootstrap and `lib/theme.ts` change
  together.
- **Stars** are on by default: a WebGL sky (brightness, amount, and clouds in
  five versions, with cover and a 3x3 place picker), at up to 30 fps, paused
  in a hidden tab, still under reduced motion. While it's on, large
  backgrounds go see-through, editors and code blocks included. Menus,
  dialogs, popovers, and small controls keep their fills. Full screen keeps
  the sky.
- **Scrollbars follow their surface:** page areas use the theme's
  `--scrollbar`, code areas their code theme's (the paired page theme's thumb
  at each contrast), and dropdown lists are dark under dark themes. A
  theme-menu switch, on by default, hides every scrollbar (xterm's included)
  while everything still scrolls.
- **Tooltips are title attributes,** and Hide tooltips (on by default) keeps
  them all off the page (`components/chrome/tooltip-guard.tsx`). Draggable
  borders highlight through the `handle-hover` and `handle-active` variants,
  which Hide border highlight (on by default) turns off, keyboard focus
  still highlighted. Use those, not `group-hover`, on a new border.
- **Hover and active highlights are the neutral gray `--raised`,** done checks
  are green (`--complete`) in every theme, and Run and Check keep their labels
  while busy (only greyed out), so bars never shift.
- **Syntax colors match everywhere:** editors and static code blocks use the
  same tokenizer (`lib/tokenize.mjs`, Lezer for TypeScript), with escape
  sequences in their own color and directives in the keyword color. Each
  language's predefined types and standard objects take the keyword color
  where they aren't called (`PREDEFINED` in `lib/tokenize.mjs`, `JS_GLOBALS`
  shared with Lezer's TypeScript), and your own names stay plain. Audit a
  language by tokenizing its course code and reading the plain names left.
- Output blocks share the terminal look, and clean runs drop the "exit code 0"
  line (non-zero codes and kill signals stay).

## Layout and behavior

- **Nothing flashes or shifts on load.** Every visual setting is applied to
  `<html>` before first paint (the bootstrap in `app/layout.tsx`), and menus
  read the applied state, so they never show a default for a frame.
- **A reload keeps your place:** the open panel, the challenge and its hints,
  list filters, the cheatsheet search and section, the SQL view, Learn's tab
  and hints and position, and full screen are in the address. Every
  draggable border's position (splits, pane sizes, the lesson list or the
  output folded or not) is saved where you leave it and applied before first
  paint (`lib/panes.ts`, read through `lib/pane-size.ts`, a fold marking
  `<html>` for CSS), so a new border goes in that table. Answer reveals ask
  again after a reload.
- **Stdin goes with the output when it's under the editor:** side by side
  it's the code box's last row, and stacked (Learn, the compiler with a
  panel open, stacked, or on a phone) it's a box of its own at the top of the
  output, over what comes back, with Bash's args and files
  (`components/code/program-input.ts`). Stdin is open by default in Learn and
  folded in the compiler (its toggle then showing its first line), and each
  page keeps it as you leave it, saved and painted that way from the first
  frame (`lib/stdin-shown.ts` marks `<html>`, read by the `stdin-open:` and
  `stdin-closed:` variants). Open, it's as tall as its text (two lines at
  most, then it scrolls), with no fill and no line lighting up over it as
  you type. There,
  dragging the border well past the output's smallest (or End, or a step
  down from it) folds the output away, and Run or Check opens it again at
  its smallest. Phones have no border, so no fold.
- **Hover is intent:** links prefetch, and code examples warm their editor on
  hover.
- **Learn never scrolls the page on desktop.** The lesson list and the lesson
  scroll inside their own panes under the header (`learn-shell.tsx` keeps a
  fixed height). The list docks at 1280px and up and is a drawer below, and
  its border drags (all the way left folds it).
- **The compiler page's header scrolls away** with the page instead of
  covering it.
- **Full screen has three steps:** off, then semi (only the header hides, the
  theme button floats bottom right, back and forward stay in the page's bar,
  Learn's list stays docked), then full (the workspace covers the window, its
  controls float), then off. It's one mode for the whole app, in the address
  (`?full=semi`, `?full=1`), and Escape leaves it.
- **The theme menu has two columns** on desktop so it never scrolls: themes,
  contrast, and code settings on the left, lines and the sky on the right.
- **Going between the compiler and Learn asks first** with a popup, and
  clicking the same button again confirms. Only Cancel or a click outside
  closes it.
- **Answers are hidden behind the eye:** the first time on a page it glows and
  needs a second click within 3 seconds. Your code is kept. The floating Next
  glows the same way after a passing Check, then fades.
- **Test cases open on a click:** in every check's results (Learn, the
  challenges, the IDE's Results) each test opens at once, on a click, to what
  it ran and what came back, with no chevron and no hover fill (the pointer
  says it's clickable). They start closed, and one opens at a time
  (`useOneOpen`, `components/ui/one-open.ts`). Learn's and the challenges'
  tests are a row of tabs, each its mark and number only (no "passed" or
  "failed"), the open one only gaining the gray (its text stays the same
  color), since their output is always under the editor and short on
  height. There's no summary line, pass or fail ("Solved!" included), only
  a pass's way on (the next part or challenge), and screen readers still
  hear the verdict. The IDE's Results stay a list, its checks having names.
- **No output header under the editor:** the gold Output or Results label
  and its row (with Clear) show only while the output is beside the editor.
  Under it (Learn, the compiler with a panel open, stacked, or on a phone)
  they're gone for the height, the box still named for screen readers, and
  where that row holds the Cheatsheet, Challenges, and Learn buttons (the
  compiler with no panel open) only the label goes. SQL's Results and
  Database tabs always stay. A run's exit code shows as the line under its
  output, Bash's included. Rejected: a switch for it in the editor settings.
- **Code examples:** Reset (only once changed), Copy, then Run, as plain icons
  that are always visible. Clicking the code edits it in place, `Mod-Enter`
  runs it, and clicking off it or Escape returns it to plain code with the
  edits kept.
- **Motion** (GSAP, `lib/motion.ts`) answers what you do and never plays on
  first paint, and reduced motion turns it off.
- The bottom shade behind Learn's Previous and Next spans the whole part, and
  a theme-menu switch turns it off.

## Decided and rejected

- Rejected: themed hover and active highlights (keep `--raised`), a two-click
  glowing Learn button with no popup (keep the popup), blue done checks in
  Nord and Solarized (keep green), and fills or zebra bands that change with
  the line sliders.
- Kept on purpose: the gray highlight, the green checks, and the confirm
  popup.
