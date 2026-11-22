# Writing challenges

The **Challenges** tab on the compiler page is a list of short problems for
drilling a language's basics, grouped by the same categories as the reference
(`content/reference/categories.json`). Each one checks a single idea: can you
write a loop, use a map, slice a string, define a class. They are quick
(very easy to medium), and the same problem exists in every language
(Python, JavaScript, TypeScript, C++, Java, and Go), so you can practice one
problem set in whichever language you are learning.

The categories marked `"dsa": true` (sorting through greedy) are
the data structures and algorithms set: practice for interview-style problems,
each one built so you can't solve it without the structure or the technique it
teaches (a max heap, a sort by two keys, a trie, a BFS). See
[Data structures and algorithms](#data-structures-and-algorithms).

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
  steps), or `medium` (two or three basic ideas combined). Only a DSA category
  may be `hard`: a structure you build yourself (a trie, an LRU cache) or two
  techniques together (two heaps, Dijkstra).
- `statement`: Markdown, language neutral (say "a list of numbers", not
  "an ArrayList"). One or two sentences on the task, then the exact input and
  output format, then test 1 as an example: an `Input:` line and a
  ```` ```text ```` block (when there is input), then an `Expected output:` line
  and a ```` ```text ```` block. The verifier checks they match test 1.
  Write limits as powers so they read at a glance: `1 <= n <= 10^9`, "between
  -10^6 and 10^6", `10^9 + 7`, and the 32-bit range as -2^31 to 2^31 - 1 with
  its exact digits beside it when the output must match them. The renderer
  raises the exponent (content/learn/AUTHORING.md, Writing style).
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

## Data structures and algorithms

A DSA challenge is a small, classic interview problem (LeetCode easy to
medium, a few hard), chosen so the category's structure or technique is the
natural way to solve it: Kth largest needs a heap, meeting rooms needs a sort
by start, a word list's prefixes need a trie. Within a category, spread the
challenges over the calls people need, so that solving the set touches each
one at least once (for heaps: build one from a list, push, pop, peek, a max
heap, a heap of pairs ordered by a key). The statement names the problem the
way interview sites do and says what to find, never which structure to use.
The hints may.

**Input formats**, the same in every DSA challenge:

- A list: the count `n`, then `n` values on the next line (`0` and an empty
  line for an empty list).
- A linked list: a list, which the starter builds into nodes.
- A binary tree: one line in level order with `null` for a missing child,
  LeetCode's way (`3 9 20 null null 15 7`), and a lone `null` for an empty tree.
  The starter builds it.
- A graph: `n m`, then `m` lines `u v` (or `u v w` with a weight), the nodes
  numbered `0` to `n - 1`. The statement says whether edges are directed.
- A grid: `rows cols`, then `rows` lines of characters with no spaces (`#.#`),
  or of numbers separated by spaces.
- A design problem (a trie, a min stack, an LRU cache): the count `q`, then
  `q` lines with an operation and its arguments (`insert apple`,
  `search app`). The program prints one line for each operation that answers
  something, in order.

**Starters** do all the plumbing, so the learner writes only the algorithm:
the starter reads the input, builds the structure (the node class, the tree
from level order, the adjacency list), calls the function or the class to
complete, and prints the answer in the exact format. A linked list or a tree
prints back in its input format. A design problem's starter has the class with
its methods stubbed (`TODO`, a placeholder return). Programs may run to 120
lines here, and in the `classes` and `oop` categories, whose class design
problems carry several classes (the verifier warns past that).

**Each language's tools**, at the runtimes below:

- Python: `heapq` (a min heap, negate for a max heap, tuples for a key),
  `collections.deque`, `sorted(key=..., reverse=True)`, `bisect`,
  `functools.cache`. Raise `sys.setrecursionlimit` before deep recursion.
- JavaScript: arrays as stacks, a queue by a moving head index (not `shift`
  in a loop), and `@datastructures-js/priority-queue` 6.4.0, which the sandbox
  has (`MinPriorityQueue`, `MaxPriorityQueue`, `PriorityQueue` with a compare
  function, `enqueue`, `dequeue`, `front`, `size`, `isEmpty`).
- TypeScript: the runner has no packages, so a heap is a small class in the
  starter. Its strict settings (`noUncheckedIndexedAccess`) make an indexed
  read `T | undefined`, so solutions check or give a default.
- C++: `std::priority_queue` (a max heap, `std::greater<>` or a comparator
  lambda for a min heap or a key), `std::sort` and `std::stable_sort` with a
  lambda, `lower_bound`, `std::stack`, `std::queue`, `std::deque`, `std::map`,
  and node structs with raw pointers (small programs, never freed).
- Java: `PriorityQueue` (a min heap, `Collections.reverseOrder()` or a
  comparator for a max heap, `addAll`), `ArrayDeque` for stacks and queues,
  `Arrays.sort` with a comparator (`int[][]` by a column), `List.sort`,
  `Comparator.comparing` and `thenComparing`, `TreeMap` and `TreeSet` (`floorKey`,
  `ceiling`). Compare with `Integer.compare`, never `a - b`, which overflows.
  Node classes go after `Main` or as its static nested classes.
- Go: `container/heap` (a type with `Len`, `Less`, `Swap`, `Push`, `Pop`),
  `sort.Slice` and `sort.SliceStable`, `sort.Search`, slices as stacks and
  queues, and structs with pointers for nodes. No generics in Go 1.16.

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
test twice and every starter once, in every language: TypeScript on the local
runner (`npm run up` starts it, and its runs are skipped with a note when it's
off), the rest on Piston. Iterate until it prints `✓`.
