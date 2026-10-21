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
  background. Each picker warns about unreadable choices, and its custom
  swatch remembers the last custom color.
- **Stars** are opt-in: a WebGL sky (brightness, amount, and clouds in five
  versions, with cover and a 3x3 place picker), at up to 30 fps, paused in a
  hidden tab, still under reduced motion. While it's on, large backgrounds go
  see-through, editors and code blocks included. Menus, dialogs, popovers,
  and small controls keep their fills. Full screen keeps the sky.
- **Scrollbars follow their surface:** page areas use the theme's
  `--scrollbar`, code areas their code theme's (the paired page theme's thumb
  at each contrast), and dropdown lists are dark under dark themes.
- **Hover and active highlights are the neutral gray `--raised`,** done checks
  are green (`--complete`) in every theme, and Run and Check keep their labels
  while busy (only greyed out), so bars never shift.
- **Syntax colors match everywhere:** editors and static code blocks use the
  same tokenizer (`lib/tokenize.mjs`, Lezer for TypeScript), with escape
  sequences in their own color and directives in the keyword color.
- Output blocks share the terminal look, and clean runs drop the "exit code 0"
  line (non-zero codes and kill signals stay).

## Layout and behavior

- **Nothing flashes or shifts on load.** Every visual setting is applied to
  `<html>` before first paint (the bootstrap in `app/layout.tsx`), and menus
  read the applied state, so they never show a default for a frame.
- **A reload keeps your place:** the open panel, the challenge and its hints,
  list filters, the cheatsheet search and section, the SQL view, Learn's tab
  and hints and position, and full screen are in the address. Layout (splits,
  pane sizes) is not saved, and answer reveals ask again after a reload.
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
- Kept on purpose: the gray highlight, the green checks, the confirm popup,
  and stars as an opt-in.
