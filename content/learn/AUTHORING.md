# Writing Learn lessons

Learn mode teaches a language as a fast, concise how-to: read a short explanation,
study a worked example, then solve a practice problem with the exact same shape.
This file is the contract every lesson follows. `npm run lessons:verify` enforces
the mechanical parts.

## Files

```
content/learn/<lang>/index.json    the course: sections and lesson order
content/learn/<lang>/<id>.json     one lesson (file name == lesson id)
```

`<lang>` is one of `python`, `javascript`, `cpp`, `java`, `go`, `sql`. The
project courses (`web`, `react`, `nextjs`, `express`, `fastapi`, `spring`,
`go-api`) are read courses, with rules of their own in
[Read courses](#read-courses) at the end.

`index.json`:

```json
{
  "language": "python",
  "title": "Learn Python",
  "description": "One or two sentences shown at the top of the lesson list.",
  "sections": [
    { "title": "Basics", "lessons": ["print", "variables"] },
    { "title": "Control Flow", "lessons": ["if-statements"] }
  ]
}
```

## The teaching rules

These are the point of the whole feature. A lesson that breaks one is wrong even
if it verifies.

1. **Never test what was not taught.** A practice problem, its starter, and its
   reference solution may only use syntax, library functions, and ideas that this
   lesson's earlier steps or an earlier lesson in the course already taught. The
   course outline lists what each lesson teaches. If you need something not yet
   taught, put it in the starter as finished scaffolding the learner does not
   have to touch, or pick a different problem.
2. **Example first, same shape after.** Every step shows a worked example with a
   complete program, then a practice problem with the exact same structure that
   is only slightly different: different data, names, or a small twist. Someone
   who understood the example should solve the practice in a few minutes using
   the same technique.
3. **Concise how-to, not an essay.** Each step's `body` is a short explanation of
   one idea, about 60 to 200 words, with small snippets. Show, don't lecture.
   Cover the important methods and forms people actually use.
4. **Idiomatic and specific to the language.** Write the code a strong engineer
   in that language would write. Call out the language's real gotchas where they
   matter (integer division, overflow, `==` vs `.equals`, mutable defaults, `==`
   vs `===`, rune vs byte, copies vs references). For C++ and Go, explain what
   happens in memory when it helps (stack vs heap, copies, pointers, slices
   sharing a backing array).
5. **Input comes late.** Programs do not read stdin until the course's user input
   lesson. Before that, data is written in the code and each practice has one
   test. From the input lesson on, practices may read stdin and should have 2 to
   3 tests with different inputs.

## Parts: every step is its own page

Learn mode shows each step as a **part**, a small sub-lesson with its own page:
its title, body, worked example, and practice problem. Parts are listed under
their lesson in the lesson list (collapsed until you open the lesson), and the
editor next to a part has two tabs: the example and your code. The lesson's
`intro` appears at the top of part 1, and its `recap` at the end of the last part.

So write every step to stand on its own:

- Don't point at another step's content as if it were on the same page
  ("the last step", "step 2", "the list above" when it means an earlier step's
  example). Restate the one fact you need in a short clause, or say "the
  previous part" when the reference really helps.
- If a step needs something an earlier step introduced (a variable, data, or a
  definition), give it the sentence or snippet it needs.
- A step's `title` is its label in the lesson list: specific, distinct within
  the lesson, plain text, at most 60 characters and ideally under 40.

## Programs are checked by their output

Learners press Check and their program runs once per test with that test's
stdin. It passes when stdout matches the test's `output` exactly, except that
trailing spaces on a line and trailing blank lines are ignored. So:

- Specify output format exactly in the prompt: spacing, capitalization, number
  formatting, decimal places, order. Always show the expected output for the
  first test in a ```` ```text ```` block.
- **Output must be deterministic.** No randomness, clocks, memory addresses, or
  thread timing. Never print in an order that the language does not guarantee:
  sort first. In particular Python sets of strings, Go `for range` over a map,
  Java `HashMap`/`HashSet`, C++ `unordered_map`/`unordered_set`.
- Floats: say exactly how to format them (for example 2 decimal places) and make
  the solution format them that way.
- Programs must finish in well under 10 seconds and use under 512 MB.

## Runtime facts (verified in this sandbox)

Lessons must run on exactly these versions.

**Python 3.12.0.** `match` / `case`, f-strings, walrus, `math`, `collections`,
`itertools`, `functools`, `heapq`, `bisect` all available. Read input with
`input()` or `sys.stdin`.

**JavaScript, Node 20.11.1, run as a CommonJS script.** No `import` / `export`
(use `require`). No top-level `await`: wrap async code in an `async function main()`
and call it. Read all of stdin with `require("fs").readFileSync(0, "utf8")`.
`Object.groupBy` does not exist. `console.log` of arrays and objects uses Node's
inspect format (`[ 1, 2, 3 ]`, `{ a: 1 }`) and wraps arrays longer than 6 items
across several lines, so for checked output prefer `arr.join(", ")`,
`JSON.stringify(...)`, or template strings.

**C++, g++ 10.2 in C++17 mode** (`__cplusplus == 201703`). No C++20: no
`map::contains`, `<ranges>`, `<format>`, concepts, or `<=>`. Include the real
headers you use (`<iostream>`, `<vector>`, `<string>`, ...), not
`<bits/stdc++.h>`. `std::cout` prints doubles with 6 significant digits by
default: use `std::fixed << std::setprecision(n)` from `<iomanip>` when decimals
matter. Never print pointer values (addresses change every run). `sizeof` results
are stable here (x86-64 Linux: `int` 4, `long` 8, `long long` 8, pointers 8).

**Java 15.0.2, one file run directly.** The FIRST top-level class in the file
must be `public class Main` with `public static void main(String[] args)`. Put any
other classes after `Main` (package-private, no `public`) or nest them as `static`
classes inside `Main`. Available: `var`, switch expressions and `case ->` labels,
text blocks, `String.repeat` / `strip` / `isBlank` / `formatted`, `List.of`,
`Map.of`, `Set.of`. Not available: `Stream.toList()`. Don't use records, pattern
matching for `instanceof`, or sealed classes: they're only preview features in
Java 15 (the sandbox turns previews on, so learners can try them, but lessons
teach standard Java). Read input with `Scanner` or `BufferedReader`.

**Go 1.16.2.** No generics and no `any`. No built-in `min` / `max` (write a small
helper, or `math.Max` / `math.Min` for float64). No `slices` / `maps` packages, no
`strings.Cut`. Unused variables and imports are compile errors, so starters must
not contain any. `for range` over a map is randomized: sort the keys
(`sort.Strings`) before printing. `fmt.Println` of a whole map prints keys
sorted, so that is deterministic. Indent Go with tabs (gofmt style). Read input
with `bufio.NewScanner(os.Stdin)` or `fmt.Scan`.

**SQL, PostgreSQL 18 (PGlite).** The course for `sql` runs on a real
PostgreSQL 18 compiled to WebAssembly, a fresh empty database for every run,
in the browser and in the verifier alike. How SQL lessons differ:

- A lesson's `setup` (SQL) creates the tables and rows every program in the
  lesson starts from. An example's or test's `stdin` is more setup SQL that
  runs after it, so tests can add or change rows and a hardcoded answer fails.
  Prompts describe that data in words, with no `Input:` block.
- A program's output is what `psql` prints for each statement, separated by a
  blank line: an aligned table and a row count (`(2 rows)`) for statements
  that return rows, and a command tag for the rest (`CREATE TABLE`,
  `INSERT 0 3`, `UPDATE 1`, `DELETE 0`). Numbers are right-aligned, `NULL`
  prints as nothing, booleans as `t` and `f`. Run your SQL with the verifier
  (or the sandbox) and copy its output, never type a table by hand.
- The first statement that fails stops the program with `ERROR:  <message>`.
- Order every result that has more than one row with `ORDER BY` on columns
  that never tie, or the order is not guaranteed.
- Write keywords in uppercase and names in `snake_case`. End every statement
  with a semicolon.

## Runnable snippets

Every code block in a lesson (`intro`, a step's `body`, an example's
`explanation`, `recap`) and in a cheatsheet is runnable in the app: it has a
Run button, opens its output below, and can be edited (and reset). So every
block must actually run. Read courses are the exception: nothing in them runs
(see [Read courses](#read-courses)). `node scripts/verify-snippets.mjs <language>` runs
them all the way the app does and lists the ones that don't.

How a block runs (lib/snippet-harness.mjs):

- Python, JavaScript, and SQL run as written. SQL in a lesson runs after the
  lesson's `setup` (its tables exist), and in a cheatsheet on the playground's
  sample database (departments, employees, customers, products, orders,
  order_items).
- C++, Java, and Go blocks that aren't whole programs are wrapped for you:
  C++ gets `#include <bits/stdc++.h>` and `using namespace std;`, Java gets
  `java.util.*`, `java.util.stream.*`, `java.util.function.*`, `java.io.*`,
  and `java.math.*` with a `Main` class, Go gets `package main` and the imports
  it uses. Functions, types, and classes stay at the top level (Java methods
  and classes become `static` members of `Main`), and the other lines go
  inside `main`. Go also gets `_ = x` for each variable `main` declares, so an
  unused one isn't an error, and a `var` or `const` that a function uses stays
  at the package level.

The info string after the opening fence controls it:

- ` ```python ` runs normally and must exit cleanly.
- ` ```python error ` is meant to fail: it shows an error (a traceback, a
  compile error, a constraint violation), and the check makes sure it does.
- ` ```python harness ` is hidden. It wraps the next runnable block: its line
  holding just `{{code}}` becomes that block, indented like that line. Use it
  when a block is a fragment that needs context, like names from an earlier
  block, an enclosing loop or function, imports, or values to work on. For
  C++, Java, and Go the automatic wrapping runs after the harness is filled
  in, so a harness holds just that context (a struct, a class, a few
  variables), and the shown block keeps its imports and never needs a `main`
  of its own to fit. Add a print after `{{code}}` when the block itself prints
  nothing, so running it shows what it did.
- ` ```stdin ` is hidden: input for the next runnable block.
- ` ```python norun ` is shown but never runs. Only for what can't run in any
  form: a syntax template with placeholders, pseudo-code, `...` elisions.

Print what a comment promises. A comment that states a value (`# 5`,
`// [1, 2, 3]`) sits on a line that prints it and says exactly what prints, so
pressing Run shows it: `print(len(s))  # 5`, not `len(s)  # 5`. After a call
that changes a container, print the container where its new contents matter.
Every block prints something when it runs (`verify-snippets` fails one that
prints nothing), and no comment promises output that changes between runs
(addresses, hash order, random numbers).

Prefer, in order: a block that runs as written; a hidden harness that gives a
fragment its context (the shown code stays the same); `error` for a block that
demonstrates an error; a minimal rewrite of a block that isn't code on its own
(for example `std::sqrt(144)  // 12` becomes
`std::cout << std::sqrt(144) << '\n';  // 12`); and `norun` last.

```python harness
from collections import deque
start = (0, 0)
{{code}}
print(queue)
```

```python
queue = deque([(start, 0)])
```

```sql harness
SELECT id, name, city
FROM customers
{{code}}
ORDER BY id;
```

```sql
WHERE city IN ('Austin', 'Denver')
```

```go harness
type Person struct {
	Name string
	Age  int
}

p := Person{Name: "Ann", Age: 30}
{{code}}
```

```go
func (p Person) Greet() string {
	return "Hi, " + p.Name
}

fmt.Println(p.Greet()) // Hi, Ann
```

## Lesson file

```json
{
  "id": "print",
  "title": "Print Statements",
  "section": "Basics",
  "summary": "Write text and values to the console with print().",
  "intro": "Every program talks to you through its output. In Python that starts with `print()`.",
  "steps": [
    {
      "title": "Printing text",
      "body": "`print()` writes a line to the console. Put text inside quotes, single or double both work. Every call ends the line, so the next `print()` starts on a new one.\n\n```python\nprint(\"Hello\")\nprint('World')\n```",
      "example": {
        "title": "Welcome banner",
        "prompt": "Print a three line welcome banner.",
        "code": "print(\"Welcome to Hack University\")\nprint(\"Lesson 1: print\")\nprint(\"Let's write some code!\")\n",
        "output": "Welcome to Hack University\nLesson 1: print\nLet's write some code!",
        "explanation": "Each `print()` call writes its text, then moves to a new line. Three calls make three lines, in the order they run."
      },
      "practice": {
        "title": "Course card",
        "prompt": "Print a three line card for a course.\n\n1. Print `Course: Algorithms`\n2. Print `Level: Beginner`\n3. Print `Status: Enrolled`\n\nExpected output:\n\n```text\nCourse: Algorithms\nLevel: Beginner\nStatus: Enrolled\n```",
        "starter": "# Print the three lines of the course card\n",
        "solution": "print(\"Course: Algorithms\")\nprint(\"Level: Beginner\")\nprint(\"Status: Enrolled\")\n",
        "tests": [{ "output": "Course: Algorithms\nLevel: Beginner\nStatus: Enrolled" }],
        "hints": ["Use one `print()` call per line."]
      }
    }
  ],
  "recap": "- `print(\"text\")` writes one line.\n- Each call starts a new line."
}
```

Field rules (verified):

- `id`: kebab-case, equal to the file name. `section`: the section title that
  lists it in `index.json`.
- `title` at most 60 characters. `summary` one sentence, at most 160.
- `steps`: 1 to 4. Each has `title`, `body`, one `example`, one `practice`.
- `example`: `title`, `prompt` (what the program does), `code` (a complete
  program), `output` (exactly what it prints), `explanation` (why it works),
  optional `stdin` (fed in when it runs).
- `practice`: `title`, `prompt`, `starter`, `solution`, `tests` (1 to 4, each with
  `output` and optional `stdin`), optional `hints` (up to 3, gentle first).
- The **starter** must compile and run cleanly (exit 0) but must not pass the
  tests yet. Give learners the scaffold (imports, `main`, function signatures,
  input reading when that is not the point) and mark where they write code with a
  `TODO` comment. Stubs that must return something return a placeholder value.
- The **solution** is the reference answer: idiomatic, uses only taught ideas,
  passes every test.
- Programs stay short: under 80 lines, ideally under 30.

## Practice prompt shape

Model it on a good coding challenge:

```markdown
One sentence saying what to build.

1. First instruction.
2. Second instruction.
3. Third instruction.

Expected output:

```text
...exact output of test 1...
```
```

When the program reads input, show the input too (`Input:` followed by a
```` ```text ```` block, then `Expected output:`). Write both labels exactly like
that, each on its own line. The verifier checks that the blocks match test 1's
`stdin` and `output`.

## Writing style

- Second person, plain words, short sentences. Explain why, briefly.
- Titles (lesson, step, example, practice) and the summary are plain text: no
  backticks or Markdown. Name code in words or as is (`The for loop`, not
  ``The `for` loop``).
- In prose never use em dashes or semicolons. Use two sentences, a comma, or a
  colon instead. (Code is code: semicolons in code are fine.)
- Markdown the renderer supports: `##` and `###` headings, paragraphs,
  `**bold**`, `*italic*`, `` `code` ``, fenced code blocks with a language
  (`python`, `javascript`, `cpp`, `java`, `go`, `sql`, `text`), `[links](https://...)`,
  `-` bullet lists, `1.` numbered lists, `>` quotes, and pipe tables. Separate
  blocks with a blank line. Every line of a list block must start with `- ` or
  `N. `: list items are one line each, and a list, heading, or quote never
  shares a block with a paragraph. No raw HTML, no images. Code goes in
  backticks, including generic types like `vector<int>`.

## Verify

```bash
node scripts/verify-lessons.mjs <lang> <lesson-id>          # human readable
node scripts/verify-lessons.mjs <lang> <lesson-id> --json   # full details
```

Iterate until it prints `✓`. It checks the schema, the prose style and the
Markdown subset, that each practice prompt shows test 1's exact input and
output, runs each example twice (its output must match `output` and be identical
both times, with nothing on stderr), runs each solution twice against every test,
and runs each starter (it must compile, exit 0, and not pass).

## Read courses

The project courses (`web`, `react`, `nextjs`, `express`, `fastapi`, `spring`,
`go-api`) teach by explaining, with no practice and nothing to check. Every
lesson in them has `"format": "read"`: a few long parts, each explaining how
something works, with code to read and diagrams to look at. Nothing in a read
course runs, so `npm run lessons:verify -- <course>` checks the shape, the
prose, the Markdown, the code, and the diagrams, with no sandbox.

### Files

```
content/learn/<course>/index.json           the course: sections and lesson order
content/learn/<course>/<id>.json            one read lesson (file name == lesson id)
content/learn/<course>/diagrams/<name>.svg  a diagram any lesson in the course can show
```

A course being written may list no lessons yet (`"sections": []`). Learn
leaves it out until it has one.

### Who's reading, and what they already know

The courses are taken in an order, and each one assumes only what the
courses before it taught (the owner's call):

| Course | Taken after | So it assumes |
| --- | --- | --- |
| `web` (HTML, CSS, JavaScript, and the browser) | nothing | Nothing. The reader can use a browser and type in a terminal when told what to type, and that's all. |
| `react` | `web` | Everything the web course teaches (HTML, CSS, JavaScript in the browser, the DOM, events, fetch, JSON, HTTP, URLs, npm, bundlers) |
| `nextjs` | `web`, then `react` | Both of those |
| `express`, `fastapi`, `spring`, `go-api` | `web`, and that stack's language course (Learn JavaScript and TypeScript, Python, Java, or Go) | The web course and the language itself. Each API course stands on its own next to the other three, so none assumes another. |

What that means for writing:

- **Define every term the first time the course uses it.** An acronym gets
  its full name and a plain explanation before it's used on its own: "DNS,
  the Domain Name System, is the internet's address book: you give it a name
  like example.com and it gives back the number of the computer that has the
  site." So does every other word a beginner wouldn't know (a path, a
  request, a header, a port, a framework). Never assume it in a later part
  either, unless an earlier lesson in the course (or a course before it)
  explained it.
- **The web course goes slow.** It's the first course, so it starts from
  zero: what a file and a folder are on a website, what the address in the
  address bar means piece by piece, what happens when you press Enter. Use
  everyday comparisons, short sentences, and one new idea at a time, and show
  what the learner would see on their own screen. Its later lessons can go
  faster, as the reader knows more.
- **Later courses don't re-teach.** React, Next.js, and the API courses recall
  an idea from a course before them in a clause ("HTTP, the request and
  response you met in the web course, ...") and spend their words on what's
  new. Something a course before them never covered gets explained in full.

### Why before how

A learner wants to know why they need something before they learn it.

- **Every course starts with an overview lesson** (its first lesson, two or
  three parts): what the course covers and in what order, how the pieces
  build on each other, why it matters to someone building for the web, and
  what the learner will be able to do at the end. A diagram of the course's
  path helps.
- **Every lesson's intro says why first:** the problem it solves, or where a
  web developer meets it (a page that won't load, a form that sends nothing,
  a slow site, a login), and then what the lesson covers.
- **Every part opens on why it matters**, in a sentence or two, before how it
  works, and ends on where it shows up in real work when that isn't obvious.

### The teaching rules

1. **Explain how it works.** Each part answers one question, like what
   happens between pressing Enter and the first byte. Start from what you can
   see, then go one layer down. Say why it's built that way and what breaks
   without it.
2. **Build on what came before.** A part leans only on ideas the course
   already explained. When it needs one, restate it in a clause.
3. **Real code, the way teams write it.** Examples are code a strong engineer
   would ship, in the framework's current idioms, cut to what the point
   needs. Say in the prompt where the file lives in a project
   (`app/tasks/[id]/page.tsx`).
4. **Draw what words make long.** A sequence, a tree, or things talking to
   each other (a request crossing the network, a component tree rendering
   again, a middleware chain) gets a diagram. Refer to it by what it shows,
   and by its numbered steps when it has them.
5. **Real output only.** An example's `output` is what the code printed or
   answered when you ran it, copied, never typed by hand. A command you can't
   run where you write shows no output, and the prose says what it prints.

### Field rules (verified)

- `id`, `title`, `section`, and `summary` follow the rules above. The id
  can't be `diagrams` (the folder), and never one a deleted lesson used, so
  old progress never marks a new part as read.
- `intro`: 30 to 150 words, shown at the top of part 1.
- `steps`: 2 to 8 parts, ideally 3 to 6, each with `title`, `body`, and
  `examples`. Titles are distinct within the lesson.
- `body`: 100 to 1,200 words of prose (code and diagrams don't count), and
  the aim is 400 to 900, two to five minutes of reading. Under 150 or over
  1,000 is a warning. Split a long body with `##` headings and `###` under
  them, never `#`. A whole part (its body, prompts, and explanations) warns
  over 1,500 words and fails over 1,800.
- `examples`: 0 to 3, each with `title`, `prompt` (about 60 words at most),
  `language`, `code`, `explanation` (40 to 300 words), and optional `output`.
- `recap`: required, a `-` list of 3 to 8 takeaways, one line each.
- Nothing else: no `practice`, `codebase`, `file`, `template`, `setup`, or
  `fixtures`.
- Keep code under 80 lines a block. The verifier warns at 80 and fails at
  120, and it warns past 6 code blocks in one body.

### Code

Code in a read course is shown, never run: highlighted, with a copy button.
When the learner needs a ready-made server to follow along (the React and
Next.js courses' Trailhead API), link `[add the Trailhead API to your
Playground](/playground?add=trailhead-api)` where the course first needs it:
that puts `content/practice/trailhead-api` in a `trailhead-api` folder in the
Playground, never over files that are there. Every output that shows its data
is captured against that exact server.
Give each fence its language and nothing else. The languages are every one
the highlighter colors (`HIGHLIGHT_LANGUAGES` in `lib/tokenize.mjs`): `html`,
`css`, `javascript` (`js`), `jsx`, `typescript` (`ts`), `tsx`, `json`,
`http`, `bash` (`sh`), `sql`, `python`, `java`, `go`, `cpp`, `yaml`, `toml`,
`xml`, `properties`, `env`, `dockerfile`, `makefile`, `markdown`, and `text`
for anything else.

- JSON must parse, and JavaScript, JSX, TypeScript, and TSX must parse with
  no errors, so shown code can't carry a typo. A block that leaves code out
  (`...` in place of the rest) takes the `sketch` flag, which skips that
  check: ```` ```tsx sketch ````. No other flag, and no ```` ```stdin ````
  block, since nothing runs.
- A command goes in a `bash` block, and what it prints in `output` or a
  `text` block. Never mix prompts and output.
- Write an HTTP exchange as `http`: the request line, headers, a blank line,
  the body, and the response the same way from `HTTP/1.1 200 OK`.
- Indent with spaces, except Go and Makefiles.
- The theme menu can hide code comments, so a comment never says something
  the prose doesn't.

### Diagrams

A diagram is an SVG in the course's `diagrams` folder, drawn where its fence
is. It can go in the intro, a body, an example's prompt or explanation, or
the recap. The line inside the fence is an optional caption (inline Markdown,
one line, at most 160 characters).

````markdown
```diagram request-path
The browser waits on DNS before it can connect.
```
````

The app reads the file with a strict parser (`lib/diagram.mjs`) and draws it
inline, element by element, in the theme's colors, so a diagram never names a
color. Each element takes a class from this table, and every theme and
contrast level colors it:

| Class | Goes on | Draws |
|---|---|---|
| `dg-box` | shapes | a thing (a component, a server, a table): a filled box, outlined |
| `dg-strong` | shapes | the same, emphasized with a heavier outline |
| `dg-hot` | shapes | the one or two things the part is about: the accent fill |
| `dg-off` | shapes | skipped, idle, or not there yet: dashed, faint, no fill |
| `dg-frame` | shapes | a boundary (a browser, a machine, a network, a process): dashed, faint, no fill |
| `dg-badge` | `circle` | a step number's disc |
| `dg-line` | lines | a connection or a call |
| `dg-flow` | lines | the path to follow, in the accent |
| `dg-dashed` | lines, with `dg-line` or `dg-flow` | a reply, async, or optional: dashed |
| (none) | `text` | a label: 14px, medium |
| `dg-heading` | `text` | a group's name: 15px, semibold |
| `dg-note` | `text`, `tspan` | a second line: muted, 12px |
| `dg-faint` | `text`, `tspan` | a de-emphasized label (on `dg-off`): faint, 12px |
| `dg-code` | `text`, `tspan` | code, headers, paths, and values: the code font, 12.5px |
| `dg-on-hot` | `text` | text on a `dg-hot` shape |
| `dg-on-badge` | `text` | the number in a badge |

Shapes are `rect`, `circle`, `ellipse`, `polygon`, and a closed `path`.
Lines are `line`, `polyline`, and `path`. Text takes at most one color class
(`dg-note`, `dg-faint`, `dg-on-hot`, `dg-on-badge`) and one face
(`dg-heading`, `dg-code`). An element with no class still looks right: text
is a label, lines are `dg-line`, and shapes are `dg-box`.

Rules the verifier and the build enforce:

- The root is `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 H">`
  with no `width` or `height`. Width 320 to 720 (680 is one unit to a
  pixel), height 120 to 900.
- The first two children are `<title>` (what it shows, at most 100
  characters) and `<desc>` (the whole story in 15 to 120 words, since screen
  readers don't read the labels). Both follow the prose style.
- Only `g`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
  `path`, `text`, and `tspan`, with geometry (`x`, `y`, `width`, `height`,
  `rx`, `ry`, `cx`, `cy`, `r`, `x1` to `y2`, `dx`, `dy`, `d`, `points`), a
  `transform` (translate, rotate, or scale), `text-anchor`, `class`, and the
  markers: `marker-end="url(#arrow)"`, `url(#arrow-flow)` (on `dg-flow`
  only), and `marker-start="url(#dot)"`.
- No colors, styles, fonts, ids, links, images, scripts, animation, opacity,
  `defs`, or editor metadata. Comments are fine. At most 32 KB, 400 elements,
  and 8 levels deep.
- A part shows a diagram once, and three diagrams at most. A diagram no
  lesson shows is a warning.

How to draw one:

- **Canvas:** `viewBox="0 0 680 H"` with H a multiple of 20 (typically 160
  to 560). Use a 20-unit grid and 20 units of margin. At 680, one unit is one
  pixel in the lesson column. Narrower screens shrink it to about 70%, then
  scroll it sideways.
- **Boxes:** `rect` with `rx="8"` (the button radius), at least 40 tall for
  one line of text and 56 for two. Frames use `rx="12"` (the card radius).
- **Labels:** at the box's center with `text-anchor="middle"` and
  `dy="0.35em"`, which is more portable than `dominant-baseline`. A second
  line is a `tspan` with the same `x` and `dy="1.4em"`, set as high above the
  center as the second line falls below it.
- **Room for wider fonts:** the theme menu's body font changes label widths.
  Make a box at least 9 units per character of its longest label, plus 24,
  and check it in Georgia and Comic Sans. Code labels (`dg-code`) are 7.5
  units a character in JetBrains Mono.
- **Lines:** straight runs (`H` and `V` in a path). Arrows end 4 units short
  of their target. Arrowheads only point forward, so a reply is its own
  dashed line.
- **The path to follow:** `dg-flow` on the steps that matter. When order
  matters, number its steps with badges (`circle r="10"` with `dg-badge`, and
  a `text` with `dg-on-badge`), and let the prose say "step 3".
- **Emphasis:** `dg-hot` for one or two things, `dg-off` for what's skipped
  or idle, `dg-dashed` for replies and anything asynchronous.
- **Text:** labels only. The explanation lives in the body.
- **Never:** colors, inline styles, ids, fonts, opacity, or exported editor
  metadata. Draw it by hand or tidy an export down to these elements.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 200">
  <title>A request's first hops: DNS, then the HTTP request</title>
  <desc>The browser asks a DNS resolver for the server's address and gets an IP back. It then connects to that IP and sends the HTTP request, which the server answers.</desc>
  <rect class="dg-box" x="20" y="80" width="140" height="56" rx="8"/>
  <text x="90" y="108" dy="0.35em" text-anchor="middle">Browser</text>
  <rect class="dg-box" x="270" y="20" width="140" height="40" rx="8"/>
  <text x="340" y="40" dy="0.35em" text-anchor="middle">DNS resolver</text>
  <rect class="dg-hot" x="520" y="80" width="140" height="56" rx="8"/>
  <text class="dg-on-hot" x="590" y="108" dy="0.35em" text-anchor="middle">Server</text>
  <path class="dg-line" d="M160 96 H220 V40 H266" marker-end="url(#arrow)"/>
  <path class="dg-flow" d="M160 120 H516" marker-end="url(#arrow-flow)"/>
  <text class="dg-code" x="338" y="150" text-anchor="middle">GET / HTTP/1.1</text>
</svg>
```

`npm run lessons:verify -- <course>` checks every rule here, and
`npm run build` fails on a diagram the parser refuses, saying where and why.
