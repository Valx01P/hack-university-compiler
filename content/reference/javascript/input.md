# User Input

Node has no `input()`. The simple way is to read all of stdin at once with `require("fs").readFileSync(0, "utf8")`, then split it into lines and words. Everything arrives as strings, so convert numbers with `Number`.

### Read everything

```javascript
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");     // 0 is stdin
const lines = input.trim().split("\n");       // array of lines
```

### Numbers from a line

```javascript
// input: "3\n5 2 9"
const n = Number(lines[0]);                   // 3
const nums = lines[1].split(" ").map(Number); // [ 5, 2, 9 ]
const sum = nums.reduce((a, b) => a + b, 0);  // 16
if (nums.some(Number.isNaN)) console.log("bad number in the input");
```

### Token by token

When values are spread over lines in any way, split on all whitespace and walk with an index.

```javascript
// input: "2\n7   4\n"
const tokens = input.split(/\s+/).filter(Boolean);   // [ '2', '7', '4' ]
let pos = 0;
const next = () => tokens[pos++];

const count = Number(next());   // 2
const first = Number(next());   // 7
```

### Into a Map, a Set, and objects

```javascript
// input:
// 3
// ann 31
// bob 25
// ann 40
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }
}

const n = Number(lines[0]);
const best = new Map();   // name -> highest age
const names = new Set();  // distinct names
const people = [];

for (const line of lines.slice(1, 1 + n)) {
  const [name, ageText] = line.split(" ");
  const age = Number(ageText);
  names.add(name);
  best.set(name, Math.max(best.get(name) ?? 0, age));
  people.push(new Person(name, age));
}
names.size;          // 2
best.get("ann");     // 40
people[1].name;      // 'bob'
```

### A grid of characters

```javascript
// input: "#.#\n.#."
const grid = lines.map((row) => row.split(""));
grid[1][1];          // '#'
```

### Line by line with readline

Use this for long input or interactive prompts. It is asynchronous, so the work goes in callbacks or an `async` function.

```javascript
const readline = require("readline");

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    console.log(`> ${line}`);
  }
}
main();
```

```javascript
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("name? ", (answer) => {
  console.log(`hi ${answer}`);
  rl.close();
});
```

| Call | Does |
| --- | --- |
| `fs.readFileSync(0, "utf8")` | all of stdin as one string |
| `s.trim().split("\n")` | lines, without the trailing empty one |
| `s.split(/\r?\n/)` | lines, also for Windows line endings |
| `line.split(" ").map(Number)` | a row of numbers |
| `s.split(/\s+/).filter(Boolean)` | every word, any spacing |
| `Number(s)` | string to number, `NaN` if it is not one |
| `parseInt(s, 10)` | leading integer, ignores trailing text |

### Gotchas

- Forgetting to convert: `"5" + 1` is `"51"`. Run `Number` on anything you do math with.
- `Number("")` and `Number(" ")` are `0`, not `NaN`, so a blank line quietly becomes zero.
- Without `trim()`, the final newline gives an extra empty last line. With no input at all, `"".split("\n")` is still `[ '' ]`.
- `readline` is asynchronous: code below `rl.question(...)` runs before the answer arrives. Put the work inside the callback or the `async` function.
