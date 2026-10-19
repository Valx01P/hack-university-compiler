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

`<lang>` is one of `python`, `javascript`, `cpp`, `java`, `go`, `sql`.

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
