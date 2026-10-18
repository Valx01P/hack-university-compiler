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

`<lang>` is `python`, `javascript`, `cpp`, `java`, or `go`. Every language has
one file per category id in `categories.json`.

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
  Java 15, Go 1.16. Never show a feature newer than that (no `std::format`,
  records, generics in Go, `Object.groupBy`). If a newer feature is the
  modern way, you may mention it in one line as "not available here".
- Snippets may be fragments, but every line must be valid in context. Before
  you write a snippet, wrap it in a complete program and run it in the sandbox:
  `curl -s http://127.0.0.1:2000/api/v2/execute -H 'content-type: application/json'
  -d '{"language":"<runtime>","version":"*","files":[{"content":"..."}]}'`
  (runtimes: `python`, `javascript`, `c++`, `java`, `go`).
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
