# For Loops

JavaScript's `for` is C-style: start, condition, update. Declare the counter with `let`, never `var`, so each pass gets its own copy. There is no `range()`, so the counted loop is how you count.

### Count up, down, and by steps

```javascript
for (let i = 0; i < 5; i++) {
  console.log(i); // 0 1 2 3 4 (one per line)
}

for (let i = 5; i > 0; i--) {
  console.log(i); // 5 4 3 2 1
}

for (let i = 0; i <= 10; i += 5) {
  console.log(i); // 0 5 10
}
```

### break and continue

```javascript
for (let i = 0; i < 10; i++) {
  if (i % 2 === 0) continue; // skip evens, go to the next i
  if (i > 7) break;          // leave the loop
  console.log(i);            // 1 3 5 7
}
```

### Two variables at once

```javascript
for (let i = 0, j = 4; i < j; i++, j--) {
  console.log(i, j); // 0 4, then 1 3
}
```

### Nested loops and labels

```javascript
for (let row = 1; row <= 3; row++) {
  const cells = [];
  for (let col = 1; col <= 3; col++) {
    cells.push(row * col);
  }
  console.log(cells.join(" ")); // 1 2 3, then 2 4 6, then 3 6 9
}

// A label lets break and continue target the outer loop
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 1) continue outer; // next i
    if (i === 2) break outer;    // leave both loops
    console.log(i, j);           // 0 0, then 1 0
  }
}
```

### for...of and for...in

```javascript
for (const x of [10, 20, 30]) {
  console.log(x); // 10 20 30 (values)
}

for (const ch of "hey") {
  console.log(ch); // h e y
}

const ages = { ann: 31, bo: 25 };
for (const key in ages) {
  console.log(key, ages[key]); // ann 31, then bo 25
}
```

| Loop | Gives you | Use it for |
| --- | --- | --- |
| `for (let i = 0; i < n; i++)` | a counter | indexes, steps, counting |
| `for (const x of iterable)` | values | arrays, strings, `Map`, `Set` |
| `for (const k in obj)` | keys, as strings | plain objects |
| `arr.forEach((x, i) => {})` | value and index | short callbacks, no `break` |

### Range without a counter

```javascript
for (const i of Array(3).keys()) {
  console.log(i); // 0 1 2
}

const range = Array.from({ length: 5 }, (_, i) => i + 1);
console.log(range.join(",")); // 1,2,3,4,5
```

### Accumulate

```javascript
let total = 0;
const parts = [];
for (let i = 1; i <= 5; i++) {
  total += i;
  parts.push(i);
}
console.log(parts.join(" + ") + " = " + total); // 1 + 2 + 3 + 4 + 5 = 15
```

### Print on one line

```javascript
for (let i = 0; i < 3; i++) {
  process.stdout.write(i + " "); // no newline
}
console.log(); // 0 1 2
```

### Gotchas

- `console.log` always ends the line. Collect into an array and `join`, or use `process.stdout.write`.
- `const i` works in `for...of` but not as a classic counter: `i++` throws `TypeError: Assignment to constant variable`.
- `for...in` on an array gives string indexes (`"0"`, `"1"`), so `i + 1` is `"01"`. Use `for...of` or a counter.
- With `var i`, callbacks created in the loop all see the final `i`. `let` gives each pass its own `i`.
