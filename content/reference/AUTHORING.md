# Writing the language reference

The **Reference** panel on the compiler page has a cheatsheet per language: a
fast lookup for someone who knows how to program but forgot how something is
spelled in this language. "How do I make a list in Go again?", "What do I
import for an ArrayList?", "What's the method to split a string?" should each
take a few seconds to answer. Rich, but direct.

## Files

```
content/reference/categories.json        the categories, in roadmap order
content/reference/<lang>/<category>.md   one section per category
```

`<lang>` is `python`, `javascript`, `cpp`, `java`, `go`, or `sql`. Every
language has one file per category id in `categories.json`, except SQL, which
has its own topics in `content/reference/sql/categories.json`.

The first line is the section's title, `# Title`, at most 40 characters. Use
the language's own name for the idea when it has one (`# Lists` in Python,
`# Arrays and ArrayList` in Java, `# Slices and Arrays` in Go). Everything
after it is the section.

## Shape of a section

1. **One or two sentences** on what it is in this language and the one thing
   to know first ("Python's list is a dynamic array. It holds any mix of types
   and grows as you append.").
2. **`###` subsections by task**: Create, Add and remove, Access, Search,
   Sort, Loop, Convert, and so on, whatever fits the topic. Each is mostly a
   short code block.
3. **A table** where a list of calls is clearer than code:
   `| Call | Does |` with the call in backticks.
4. **Gotchas**: one to four bullets at the end, the mistakes people actually
   make (integer division, `==` on strings in Java, mutating while iterating).

Code does the talking. Show imports and includes at the top of the snippet that
needs them (`import java.util.ArrayList;`, `#include <vector>`). Show results in
trailing comments (`// 3`, `# ['a', 'b']`). Prefer one small example of a loop
over the thing ("use it in a loop") to a paragraph about it. Cover the methods
people really use, not every method that exists.

Keep it scannable: under 260 lines, usually 60 to 160. No filler, no history,
no "in this section we will".

## Correct and idiomatic

- Write for the exact runtime versions in `content/learn/AUTHORING.md`
  ("Runtime facts"): Python 3.12, Node 20 as CommonJS, C++17 on g++ 10.2,
  Java 15, Go 1.16, and PostgreSQL 18 for SQL. Never show a feature newer
  than that (no `std::format`, records, generics in Go, `Object.groupBy`). If
  a newer feature is the modern way, you may mention it in one line as "not
  available here".
- Snippets may be fragments, but every line must be valid in context. Before
  you write a snippet, wrap it in a complete program and run it in the sandbox:
  `curl -s http://127.0.0.1:2000/api/v2/execute -H 'content-type: application/json'
  -d '{"language":"<runtime>","version":"*","files":[{"content":"..."}]}'`
  (runtimes: `python`, `javascript`, `c++`, `java`, `go`). Test SQL with
  `node scripts/try-sql.mjs file.sql`, which runs it on a fresh PostgreSQL.
- House style per language: C++ qualifies `std::` and never writes
  `using namespace std`. Java uses explicit single-type imports and interface
  types (`List<String> names = new ArrayList<>()`). Go is gofmt-formatted (tabs).
  JavaScript uses `const` and `let`, never `var`. Python follows PEP 8.

## Markdown and style

- The same Markdown subset as lessons: `##` and `###` headings, paragraphs,
  `**bold**`, `*italic*`, `` `code` ``, fenced code blocks, `-` and `1.` lists
  with one line per item, `>` quotes, and pipe tables. A list, heading, quote,
  or table is its own block, with a blank line before and after it. No HTML.
- Code blocks are fenced with the section's language or `text`.
- Prose never uses em dashes or semicolons (code is code). Second person,
  plain words.

## Verify

```bash
node scripts/verify-reference.mjs <lang> <category> ...
```

It checks the title line, the Markdown subset, the prose style, and that every
section has a code block in its language. It can't run fragments, which is why
you test them in the sandbox as you write.

## Runnable snippets

Every code block in a lesson (`intro`, a step's `body`, an example's
`explanation`, `recap`) and in a cheatsheet is runnable in the app: it has a
Run button, opens its output below, and can be edited (and reset). So every
block must actually run. `node scripts/verify-snippets.mjs <language>` runs
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
