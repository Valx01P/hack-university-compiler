# Sets

A `Set` holds unique values in insertion order, with fast `has` checks. It is built in, so there is nothing to `require`. Equality is `===` style, so two arrays with the same contents are still different members.

### Create

```javascript
const empty = new Set();
const s = new Set([3, 1, 3, 2]);
console.log(s);                    // Set(3) { 3, 1, 2 }
console.log(new Set("hello"));     // Set(4) { 'h', 'e', 'l', 'o' }
console.log(s.size);               // 3
```

### Add and remove

```javascript harness
const s = new Set([3, 1, 3, 2]);
{{code}}
console.log([...s].join(", "));
```

```javascript
s.add(5);                  // add, a duplicate is ignored
s.add(7).add(8);           // add returns the set, so it chains
console.log(s.delete(8));  // true (false if it was not there)
```

### Check and loop

```javascript harness
const s = new Set([3, 1, 2, 5, 7]);
{{code}}
```

```javascript
console.log(s.has(3));  // true
console.log(s.has(9));  // false

for (const x of s) {
  console.log(x);       // 3, 1, 2, 5, 7 in insertion order
}
```

### Dedupe and find duplicates

```javascript
const nums = [4, 2, 4, 1, 2];
console.log([...new Set(nums)]);     // [ 4, 2, 1 ]

const seen = new Set();
const dups = [];
for (const n of nums) {
  if (seen.has(n)) dups.push(n);
  seen.add(n);
}
console.log(dups);                   // [ 4, 2 ]
```

### Union, intersection, difference

`a.union(b)` and friends are not available here (they arrived in Node 22). Spread and filter instead.

```javascript
const a = new Set([1, 2, 3]);
const b = new Set([2, 3, 4]);

console.log(new Set([...a, ...b]));                    // Set(4) { 1, 2, 3, 4 }
console.log(new Set([...a].filter((x) => b.has(x))));  // Set(2) { 2, 3 }
const diff = new Set([...a].filter((x) => !b.has(x)));
console.log(diff);                                     // Set(1) { 1 }
console.log([...diff].every((x) => a.has(x)));         // true, diff is inside a
```

### Convert

```javascript harness
const a = new Set([1, 2, 3]);
{{code}}
```

```javascript
console.log([...a]);                        // [ 1, 2, 3 ]
console.log(Array.from(a));                 // [ 1, 2, 3 ]
console.log([...a].join(", "));             // 1, 2, 3
console.log([...a].sort((x, y) => y - x));  // [ 3, 2, 1 ], sort the array, not the set
```

| Call | Does |
| --- | --- |
| `new Set(iterable)` | build from an array, a string, or another set |
| `s.add(x)` | add, returns `s` |
| `s.has(x)` | membership test, fast |
| `s.delete(x)` | remove, returns whether it was there |
| `s.size` | number of members (a property) |
| `s.clear()` | remove everything |
| `[...s]` | to an array |

### Gotchas

- Arrays and objects are members by reference: after `s.add([1, 2])`, `s.has([1, 2])` is `false`. Store a string key like `"1,2"` instead.
- A set has no index: `s[0]` is `undefined`. Spread it to an array first.
- `JSON.stringify(s)` gives `"{}"`. Use `JSON.stringify([...s])`.
- It is `size`, not `length`, and there is no `push`: use `add`.
