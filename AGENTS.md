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
  no network calls at run time. (The compiler's Terminal is your own shell on
  your computer: what you run there, Claude Code included, is yours.)
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
- **A runaway program never takes the app down.** Piston and the runner
  stop a run at 10 seconds, 1 MB of output, 512 MB, and 128 processes, and
  the output panel says why (exit codes 137 and 139 explained). SQL runs in a
  Web Worker (`lib/sql/worker.ts`) that `lib/sql/browser.ts` stops at 15
  seconds, since a PGlite query never yields, and results reach the page
  capped at 1,000 rows. The IDE's preview, which shares the app's thread on
  purpose (first-party cookies), beats a heartbeat while it shows, and after a
  page that froze with it running, it waits for a click
  (`components/ide/preview-pane.tsx`). Keep all three when changing those
  paths. The compiler's Terminal is outside all of this on purpose: it's a
  shell on your computer, like any other terminal window.
- **Docs stay short where learners read them.** The README is the install
  steps, written for someone who has never opened a terminal (numbered, per
  computer, every command copyable), and the everyday commands. Details go in
  `docs/guide.md`.

## What the app is

- **The compiler page is the online compiler first:** the language rail, the
  editor, stdin, Run, and the output. Nothing else shows by default. The
  Explorer, Terminal, Cheatsheet, and Challenges buttons open a panel beside
  the code, and Learn opens Learn mode. Never add notes, AI, or other panels
  to the page (AI belongs to the tools you run in the Terminal).
- **Each compiler has its own folder** (scope `compiler/<course>`, template
  `content/workspaces/<course>/compiler`), on this computer, one per
  language and never a challenge's: the editor shows its open file (the main
  one, main.py or Main.java, until you open another, remembered), the
  Explorer its files, and Run runs the main file with the others beside it
  for file input and more code (not C++, whose Piston build compiles every
  file, nor TypeScript, whose recipe runs one, nor SQL). The main file is
  also the page's saved code, so the editor opens on it at once and works
  with the runner down (`components/compiler/compiler-workspace.tsx`). The
  Terminal is a real shell on this computer in that folder (node-pty in the
  runner), outside the sandbox on purpose so your own tools and logins work,
  and only these workspaces get one (`shellPlace` in `runner/workspaces.ts`).
  It's kept in tmux when tmux is there (`runner/host-tmux.ts`), so leaving
  the page, closing the browser, or restarting the app never ends it (Claude
  Code keeps running), and opening the Terminal again finds it as you left
  it: the app's own tmux server, out of sight (no status bar, no keys).
  Only `exit`, closing it, or removing the folder ends it.
  The folder's hidden AGENTS.md and CLAUDE.md tell AI tools what it is (the
  runner refreshes them with the template, unless the learner edited them),
  `.hu/editor.md` what the editor has open (the file or a challenge's code,
  the cursor, the selection), and `.hu/last-run.md` the last run, so "what's
  my error" needs no file named. Any tool's edits (Claude Code, Codex, any
  model or harness: it's the files alone) wait for review in the editor
  (`lib/outside-changes.ts`, `components/compiler/change-review.tsx`):
  @codemirror/merge's unified view, removed lines red and added green, each
  change with its Accept and Reject, and a bar over the editor stepping
  through the files with Accept all and Reject all. Rejecting writes back
  what was there. The page's own writes (saves, the Explorer's operations,
  told to it by the store) never count, and it never opens a file by itself.
- **Teaching lives in Learn mode** (`/<lang>/learn/<lesson>/<part>`): the part
  on the left, the editor on the right, each lesson split into parts with one
  idea, one to three worked examples, and a practice with the same shape.
  Never test what wasn't taught, and write each course in its language's
  idioms.
- Python, JavaScript, C++, Java, and Go run on Piston. SQL runs on PGlite in
  the page. TypeScript and Bash run on the local runner. Code that runs in
  other online compilers runs here too: Java starts from the class with
  `main` wherever it sits (`javaEntry` in `lib/source-file.mjs`, compiled by
  `scripts/piston-extras/java/run` when it isn't first), JavaScript with a
  top-level await runs as a module, and ES modules (those, and TypeScript)
  get `require()`. The project courses
  (web, React, Next.js, Express, FastAPI, Spring Boot, Go APIs) open real
  codebases in the IDE.
- **Challenges come in two sets, the same in every language:** the basics
  (very easy to medium, one idea each), and data structures and algorithms
  practice in the categories marked `"dsa": true` (sorting through greedy,
  plus string, bit, array, and class design problems in the basic
  categories), each built so it can't be solved without the structure or
  technique it teaches, and only those may be hard. Their starters do the
  plumbing (input, a `ListNode` or `TreeNode`, printing), and class design
  starters give one or two methods or only the description. Every DSA
  category has a cheatsheet section in every language. Rules are in
  `content/challenges/AUTHORING.md`.
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
- **Fonts** (the theme menu): one for the app's text (Inter, System,
  Helvetica, Georgia, Comic Sans) and one for code, the editors, code
  blocks, and the terminal (JetBrains Mono, Menlo, Courier New, Comic Sans).
  Inter and JetBrains Mono are bundled and the rest are the computer's own,
  so nothing loads from the network.
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
  top at 50% cover), the editors on Midnight at 15px, tab size 4, with
  intellisense and matching brackets on and line wrapping off, the terminal
  and the Explorer on their theme backgrounds (the terminal's colors, text
  12px, and line spacing 1.10 all VS Code's, its vividness 120% and
  contrast 5.5:1, the Explorer's text 13px and its highlight none),
  the app in Inter and code in JetBrains Mono, and the compiler's editor on
  the left. A setting is stored only when it differs from its default, so
  changing a default means storing the old one by name (like
  `hu-stars=off`), and the bootstrap and `lib/theme.ts` change together.
- **Stars** are on by default: a WebGL sky (brightness, amount, and clouds in
  five versions, with cover and a 3x3 place picker), at up to 30 fps, paused
  in a hidden tab, still under reduced motion. While it's on, large
  backgrounds go see-through, editors and code blocks included (an
  editor's line numbers too, the code clipped at their edge as it scrolls
  sideways, `clipUnderGutters` in `lib/editor-extensions.ts`, never a filled
  gutter). Menus, dialogs, popovers, and small controls keep their fills.
  Full screen keeps the sky.
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
  while busy (only greyed out), so bars never shift. The panel's buttons
  drop their labels for their icons when their row is too narrow, all at
  once and at the same height.
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
- **Borders drag smoothly:** sizes keep two decimals (never whole-percent
  steps), a drag applies one move a frame straight to its CSS variable, and
  React hears the size when it's let go (`holdPaneUpdates` in
  `lib/pane-size.ts`), saved a moment later. Nothing heavy runs per frame: a
  terminal refits once its size settles, its shell hears that size once, it
  re-themes only when its own settings change (not the panes' sizes on
  `<html>`), and the panel's hidden views skip layout (content-visibility).
- **A terminal never flickers as it resizes:** the shell hears the new size
  first, and the old screen stays until the shell's redraw for it is whole
  (tmux's marked as a synchronized update, `sync` in `runner/tmux.conf`,
  another shell's once it goes quiet, 300ms at most). Then the resize, as
  the bridge's own sequence, and the redraw go to xterm in one write, drawn
  in one frame (`lib/terminal-bridge.ts`). Resized first, xterm showed the
  old screen rewrapped until the redraw came, a jump and back. And while a
  border moves at a zoom that isn't a whole number of pixels (Chrome at 90%
  is 1.8), xterm's WebGL canvas gains or loses a pixel at each spot, which
  empties it: it draws again in the same callback, never a frame later
  (`drawOnPixelResize` in terminal-view.tsx), or the terminal flashes. The runner
  reads `tmux.conf` again into a tmux server that's already running, so the
  config only sets list entries by number, never appends.
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
- **The panel's buttons never close it** (only its X does): pressed while
  showing, Challenges goes from a challenge back to the list, and from the
  list back to the challenge you were on last in that language (saved,
  `useLastChallenge` in `lib/challenge-progress.ts`), and Cheatsheet stays.
- **Full screen has three steps:** off, then semi (only the header hides, the
  theme button floats bottom right, back and forward stay in the page's bar,
  Learn's list stays docked), then full (the workspace covers the window, its
  controls float), then off. It's one mode for the whole app, in the address
  (`?full=semi`, `?full=1`), and Escape leaves it.
- **The theme menu has two columns** on desktop and keeps its size (at most
  36rem tall): themes, contrast, and code settings on the left, lines and
  the sky on the right, filling it. Newer settings (the terminal, the
  fonts, the Explorer, and the compiler's sides) go below them, in two
  columns of their own, a scroll away inside the menu. Rejected: a third
  column for them.
  It closes from its button or a click outside it (the owner tried it
  staying open and went back), or Escape from inside it, never Escape typed
  elsewhere (vim in the terminal). Its top bar, flush with its top edge, or
  any empty part of it drags it anywhere in the window (out of the way of a
  setting you're watching), double-clicking the bar puts it back, and it
  reopens where you left it for the visit, scrolled where you left it (that
  kept in the browser, reloads too).
- **The terminal and the Explorer have their own look** (the theme menu,
  `lib/theme.ts`): a background (the theme's own, see-through with the
  stars, or a color, which shows over the stars too) and a text size, for
  every terminal and Explorer, the IDE's included, and the Explorer's
  highlight (its open file's row, and lighter under the pointer): none to
  begin with (the row unfilled, its brighter name marking it, a
  struck-through ring for a swatch, a row under the pointer the faint
  gray), the gray (kept by name, `gray`), or a color of your own tinted 40%
  like a selection, so names stay readable. The terminal's colors (Terminal colors) are VS
  Code's to begin with (its terminal's 16 colors, text, and background,
  vivid where the code themes' bright colors are pastel, which bold prompts
  like Starship's draw in), or the editor's, or any code theme's: that
  theme's own rules in globals.css also match `.term-colors`, contrast
  levels included, so a palette is never copied, and a picked code
  background stays off all but the editor's. See-through is transparent
  black, and xterm's WebGL addon, which draws a default background behind
  dim and italic cells at full alpha (a box over the sky), is patched to
  draw those clear (`clearDefaultBackgrounds` in terminal-view.tsx). Its
  colors have a vividness (their chroma, 120% to begin with) and a contrast
  (5.5:1 to begin with, whatever the app's contrast level), both in OKLCH (`lib/oklch.ts`): contrast raises a color's
  lightness alone, never blending it toward white the way xterm's minimum
  contrast does (pastel, rejected), xterm's left only for what the palette
  doesn't cover. Its line spacing is the theme menu's, any multiple of the
  text size from 1 (`lib/terminal-font.ts` names the code font again with
  an ascent and descent of 1em, since xterm rows can't be shorter than a
  font's own, JetBrains Mono's 1.32em), and its first row's text sits level
  with the editor's line 1 at any spacing (`.term-pad`). It draws with
  WebGL, as VS Code's does, so block and box characters fill their cells
  (a TUI's logo is one piece), the DOM renderer only where WebGL isn't, in
  cells an even number of the screen's pixels across and down at any zoom
  (`evenCells`), since xterm draws quadrants in eighths of a cell and a
  half between two pixels leaves a seam. The theme's own swatch
  shows what it gives (an empty ring with the stars on). Rejected: a
  separate see-through swatch, a checkerboard the same as the theme's own.
  The Explorer is VS Code's: Material icons and indent guides, with no
  heading in the compiler's panel (the tab already says Explorer), and a
  right-click on its empty space makes files and folders. Its name boxes
  (a new file or folder, a rename) are the canvas fill with no border
  (the owner's choice, a white one rejected).
- **The editor can sit on the right** of the compiler (the theme menu), the
  output and the panel taking the left: CSS mirrors the page's grids
  (`[data-mirror]` in globals.css), and the drags and arrow keys read the
  side as they go. That side's bars are a mirror image too, order reversed:
  the panel's X on the left, then Learn back to Explorer, the Explorer's
  buttons, the cheatsheet's, the challenges', and the output's rows, and
  popups opening toward the middle. Only a challenge's Previous stays before
  its Next, for their arrows. What's in each thing reads left to right as
  always, and the editor's own toolbar stays as it is. Rejected: keeping the
  buttons' reading order there.
- **The panel never moves the editor's border:** the editor has one width,
  beside the output or the panel (`compiler-split`), so the X, or opening a
  panel, leaves it where it is. The panel keeps it between 30% and 75% (`REF`
  in `compiler-app.tsx`).
- **Going between the compiler and Learn asks first** with a popup, and
  clicking the same button again confirms. Only Cancel or a click outside
  closes it.
- **Answers are hidden behind the eye:** the first time on a page it asks
  first with a popup, like the Learn and Compiler buttons (but clicking the
  eye again cancels), and after that it opens straight away. Hiding never asks.
  Your code is kept. The floating Next glows after a passing Check, then
  fades.
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

- Rejected: themed hover and active highlights (keep `--raised`; the
  Explorer highlight is one you pick yourself, none until then), a two-click
  glowing Learn button with no popup (keep the popup), blue done checks in
  Nord and Solarized (keep green), and fills or zebra bands that change with
  the line sliders.
- Kept on purpose: the gray highlight, the green checks, and the confirm
  popup.
