# Writing challenges

The **Challenges** tab on the compiler page is a list of short problems for
drilling a language's basics, grouped by the same categories as the reference
(`content/reference/categories.json`). Each one checks a single idea: can you
write a loop, use a map, slice a string, define a class. They are quick
(very easy to medium), never DSA puzzles, and the same problem exists in all
five languages, so you can practice one problem set in whichever language you
are learning.

You pick a challenge, the editor fills with its starter, you complete it, and
**Check** runs your program against the tests in the sandbox.

## Files

```
content/challenges/<id>.json    one challenge, with code for all five languages
```

```json
{
  "id": "is-even",
  "title": "Even or Odd",
  "category": "conditions",
  "difficulty": "very-easy",
  "statement": "Decide whether a whole number is even.\n\nThe input is one integer `n`. Print `true` when `n` is even and `false` otherwise.\n\nInput:\n\n```text\n4\n```\n\nExpected output:\n\n```text\ntrue\n```",
  "tests": [
    { "stdin": "4\n", "output": "true" },
    { "stdin": "7\n", "output": "false" },
    { "stdin": "0\n", "output": "true" },
    { "stdin": "-3\n", "output": "false" }
  ],
  "hints": ["A number is even when dividing it by 2 leaves no remainder."],
  "code": {
    "python": { "starter": "...", "solution": "..." },
    "javascript": { "starter": "...", "solution": "..." },
    "cpp": { "starter": "...", "solution": "..." },
    "java": { "starter": "...", "solution": "..." },
    "go": { "starter": "...", "solution": "..." }
  }
}
```

- `id`: kebab-case, equal to the file name, unique across all challenges.
- `title`: short and specific, plain text, at most 60 characters, unique.
- `category`: one id from `content/reference/categories.json`. The challenge
  must exercise that category's idea.
- `difficulty`: `very-easy` (one step, a few lines), `easy` (a loop or a few
  steps), or `medium` (two or three basic ideas combined). Nothing harder.
- `statement`: Markdown, language neutral (say "a list of numbers", not
  "an ArrayList"). One or two sentences on the task, then the exact input and
  output format, then test 1 as an example: an `Input:` line and a
  ```` ```text ```` block (when there is input), then an `Expected output:` line
  and a ```` ```text ```` block. The verifier checks they match test 1.
- `tests`: 3 to 5 when the program reads input (1 is enough when it reads
  none). Test 1 is the example. The rest cover the edge cases the statement
  names: zero, negatives, an empty string or list, a single item, ties,
  duplicates.
- `hints`: optional, up to 3, gentle first, never the answer.

## Input and output

Every program reads stdin and prints to stdout, and a test passes when the
output matches exactly (trailing spaces and blank lines are ignored).

- Keep input simple: numbers and words separated by spaces, one item or one
  record per line. When the count can vary, the first line is the count.
- Print exactly what the statement says. Booleans print as `true` or `false`
  in lowercase in every language. Decimals print with exactly 2 decimal places.
  A list prints as its items separated by single spaces on one line.
- Deterministic only: sort before printing anything from a hash map or set.

## Starter and solution

The **starter** is a scaffold that compiles and runs. It reads the input,
calls a function you complete, and prints the result in the exact format. The
function has a clear name, typed parameters where the language has types, a
`TODO` comment, and a placeholder return (`0`, `""`, `false`, an empty list),
so the starter runs but fails the tests. For categories whose point is the
input or output itself (`print`, `formatting`, `input`), the starter may be a
nearly empty program with a `TODO` comment instead.

The **solution** is the starter with the `TODO` done: same scaffold, idiomatic
code that uses the category's idea. It is what learners see when they reveal
the answer, so it should read like a good example.

Name functions the same way in every language, in each language's style:
`is_even` in Python, `isEven` in JavaScript, C++, Java, and Go. Programs stay
under 60 lines, usually 10 to 30.

Follow each language's runtime facts and conventions in
`content/learn/AUTHORING.md`:

- Python 3.12: `input()` or `sys.stdin`. PEP 8.
- JavaScript (Node 20, CommonJS): read everything with
  `require("fs").readFileSync(0, "utf8")`. `const` and `let`.
- C++17 (g++ 10.2): include the real headers you use, no `bits/stdc++.h`, never
  `using namespace std`. Read with `std::cin`.
- Java 15: `public class Main` is the first class, explicit single-type
  imports, read with `Scanner` or `BufferedReader`. No records.
- Go 1.16: gofmt formatting (tabs), no generics, read with `bufio` or
  `fmt.Scan`.

## SQL challenges

SQL has its own challenge set: query problems on small datasets, using SQL's
categories (`content/reference/sql/categories.json`). A SQL challenge has only
`code.sql`, and a `setup` field with the SQL that creates and fills its tables.
Each test's `stdin` is more setup SQL on top (extra rows, changed values), so a
query that hardcodes the answer fails. The statement describes the tables and
what to return, then shows test 1's result after `Expected output:` (no
`Input:` block). Output is what `psql` prints (see the SQL notes in
`content/learn/AUTHORING.md`), so order every multi-row result with
`ORDER BY` on columns that never tie. The starter is a query skeleton with a
`-- TODO` comment that runs but returns the wrong result.

## Writing style

The statement and hints follow the lesson style: second person, plain words,
no em dashes or semicolons in prose, the supported Markdown subset (see
`content/learn/AUTHORING.md`).

## Verify

```bash
node scripts/verify-challenges.mjs <id> ...           # every language
node scripts/verify-challenges.mjs <id> --lang=java   # one language
```

It checks the schema and statement, then runs every solution against every
test twice and every starter once, in all five languages. Iterate until it
prints `✓`.
