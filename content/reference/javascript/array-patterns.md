# Array Loop Patterns

Most patterns are a counted `for` with a different start, stop, or step. Every snippet here uses this array and collects results with `push` and `join` so they print on one line.

```javascript
const a = [10, 11, 12, 13, 14, 15];
console.log(a.join(" ")); // 10 11 12 13 14 15
```

### Reverse

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const out = [];
for (let i = a.length - 1; i >= 0; i--) {
  out.push(a[i]);
}
console.log(out.join(" ")); // 15 14 13 12 11 10

console.log([...a].reverse().join(" ")); // same, copy first since reverse() mutates
```

### Every other index (step by 2)

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const evenIdx = [];
for (let i = 0; i < a.length; i += 2) evenIdx.push(a[i]);
console.log(evenIdx.join(" ")); // 10 12 14 (indexes 0, 2, 4)

const oddIdx = [];
for (let i = 1; i < a.length; i += 2) oddIdx.push(a[i]);
console.log(oddIdx.join(" ")); // 11 13 15 (indexes 1, 3, 5)
```

### Skip odd values

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const evens = [];
for (const x of a) {
  if (x % 2 !== 0) continue; // skip odd values
  evens.push(x);
}
console.log(evens.join(" ")); // 10 12 14
console.log(a.filter((x) => x % 2 === 0).join(" ")); // 10 12 14
```

### Every k-th, first n, last n

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const k = 3;
const everyThird = [];
for (let i = k - 1; i < a.length; i += k) everyThird.push(a[i]);
console.log(everyThird.join(" ")); // 12 15

console.log(a.slice(0, 2).join(" ")); // 10 11 (first 2)
console.log(a.slice(-2).join(" "));   // 14 15 (last 2)
```

### Adjacent pairs

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const diffs = [];
for (let i = 0; i < a.length - 1; i++) { // stop one early
  diffs.push(a[i + 1] - a[i]);
}
console.log(diffs.join(" ")); // 1 1 1 1 1

const temps = [3, 5, 4, 8, 9];
let rises = 0;
for (let i = 1; i < temps.length; i++) { // start one late
  if (temps[i] > temps[i - 1]) rises++;
}
console.log(rises); // 3
```

### From both ends inward

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const pairs = [];
for (let i = 0, j = a.length - 1; i < j; i++, j--) {
  pairs.push(`${a[i]}+${a[j]}`);
}
console.log(pairs.join(" ")); // 10+15 11+14 12+13
```

### Reverse in place by swapping

```javascript
const b = [1, 2, 3, 4, 5];
for (let i = 0; i < Math.floor(b.length / 2); i++) {
  const j = b.length - 1 - i;
  [b[i], b[j]] = [b[j], b[i]]; // swap with destructuring
}
console.log(b.join(" ")); // 5 4 3 2 1
```

### Wrap around (circular)

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const start = 4;
const ring = [];
for (let step = 0; step < a.length; step++) {
  ring.push(a[(start + step) % a.length]);
}
console.log(ring.join(" ")); // 14 15 10 11 12 13
```

### Running total (prefix sums)

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const prefix = [];
let running = 0;
for (const x of a) {
  running += x;
  prefix.push(running);
}
console.log(prefix.join(" ")); // 10 21 33 46 60 75
```

### Sliding window of size k

```javascript harness
const a = [10, 11, 12, 13, 14, 15];
{{code}}
```

```javascript
const size = 3;
let windowSum = 0;
const sums = [];
for (let i = 0; i < a.length; i++) {
  windowSum += a[i];
  if (i >= size) windowSum -= a[i - size]; // drop the item leaving the window
  if (i >= size - 1) sums.push(windowSum);
}
console.log(sums.join(" ")); // 33 36 39 42
```

### Every pair (i before j)

```javascript
const nums = [1, 2, 3];
const combos = [];
for (let i = 0; i < nums.length; i++) {
  for (let j = i + 1; j < nums.length; j++) {
    combos.push(`${nums[i]}${nums[j]}`);
  }
}
console.log(combos.join(" ")); // 12 13 23
```

| Pattern | Loop header |
| --- | --- |
| reverse | `for (let i = a.length - 1; i >= 0; i--)` |
| every other | `for (let i = 0; i < a.length; i += 2)` |
| adjacent pairs | `for (let i = 0; i < a.length - 1; i++)` |
| both ends | `for (let i = 0, j = a.length - 1; i < j; i++, j--)` |
| wrap around | `a[(i + shift) % a.length]` |
| every pair | `for (i ...) for (let j = i + 1; ...)` |

### Gotchas

- `i <= a.length` reads one past the end and gets `undefined`, not an error. Use `<`.
- `reverse()` and `sort()` change the original. Copy first with `[...a]`, or use `toReversed()`.
- `%` keeps the sign of the left side: `-1 % 6` is `-1`. For a backwards wrap use `((i % n) + n) % n`.
- Pushing to or splicing the array inside the loop moves the stop point. Loop over a copy, or collect results in a new array.
