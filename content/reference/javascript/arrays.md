# Arrays

JavaScript has one list type, `Array`: a dynamic array that grows as you add, holds any mix of types, and needs no import. There are no fixed-size arrays (typed arrays like `Int32Array` come closest).

### Create

```javascript
const nums = [3, 1, 4];
const empty = [];
console.log(new Array(5).fill(0));                        // [ 0, 0, 0, 0, 0 ]
console.log(Array.from({ length: 5 }, (_, i) => i * i));  // [ 0, 1, 4, 9, 16 ]
console.log(Array.from("abc"));                           // [ 'a', 'b', 'c' ]
const mixed = [1, "two", true, null];                     // any types
const copy = [...nums];                                   // shallow copy
console.log(new Int32Array(3));                           // Int32Array(3) [ 0, 0, 0 ], fixed size
console.log(nums.length); // 3
```

### Access and update

```javascript
const a = [10, 20, 30, 40];
console.log(a[0]);                // 10
console.log(a[a.length - 1]);     // 40
console.log(a.at(-1));            // 40 (negative counts from the end)
console.log(a[99]);               // undefined, no error
console.log(a.slice(1, 3));       // [ 20, 30 ] (end excluded, a unchanged)
console.log(a.slice(-2));         // [ 30, 40 ]
a[1] = 25;                        // replace in place
const [first, second, ...rest] = a;
console.log(first, second, rest); // 10 25 [ 30, 40 ]
```

### Add and remove

```javascript
const a = [1, 2, 3];
console.log(a.push(4));          // 4 (adds to the end, returns the new length)
console.log(a.pop());            // 4 (removes from the end)
console.log(a.unshift(0));       // 4 (adds to the front, a is [ 0, 1, 2, 3 ])
console.log(a.shift());          // 0 (removes from the front)
console.log(a.splice(1, 1));     // [ 2 ] (removes 1 item at index 1, a is [ 1, 3 ])
console.log(a.splice(1, 0, 9));  // [] (inserts 9 at index 1, a is [ 1, 9, 3 ])
console.log(a);                  // [ 1, 9, 3 ]
a.length = 0;                    // clears the array
```

### Search

```javascript
const a = [5, 8, 12, 8];
console.log(a.includes(8));              // true
console.log(a.indexOf(8));               // 1 (-1 when missing)
console.log(a.lastIndexOf(8));           // 3
console.log(a.find((x) => x > 6));       // 8 (first match, or undefined)
console.log(a.findIndex((x) => x > 10)); // 2 (-1 when none)
console.log(a.findLast((x) => x < 10));  // 8
console.log(a.some((x) => x > 10));      // true
console.log(a.every((x) => x > 0));      // true
```

### Sort and reverse

```javascript
const a = [10, 9, 1, 100];
console.log(a.sort());                     // [ 1, 10, 100, 9 ] compares as strings!
console.log(a.sort((x, y) => x - y));      // [ 1, 9, 10, 100 ] ascending numbers
console.log(a.sort((x, y) => y - x));      // [ 100, 10, 9, 1 ] descending
console.log(a.reverse());                  // [ 1, 9, 10, 100 ] in place
console.log(a.toSorted((x, y) => y - x));  // [ 100, 10, 9, 1 ], a unchanged

const words = ["pear", "Apple", "fig"];
console.log(words.sort((x, y) => x.localeCompare(y)));  // [ 'Apple', 'fig', 'pear' ]
```

### Transform and combine

```javascript
const a = [1, 2, 3, 4];
console.log(a.map((x) => x * 2));               // [ 2, 4, 6, 8 ]
console.log(a.filter((x) => x % 2 === 0));      // [ 2, 4 ]
console.log(a.reduce((sum, x) => sum + x, 0));  // 10
console.log(a.join("-"));                       // 1-2-3-4
console.log(a.concat([5, 6]));                  // [ 1, 2, 3, 4, 5, 6 ]
console.log([...a, 5]);                         // [ 1, 2, 3, 4, 5 ]
console.log([1, [2, [3]]].flat(Infinity));      // [ 1, 2, 3 ]
console.log(Math.max(...a));                    // 4
```

| Call | Does | Changes the array? |
| --- | --- | --- |
| `push(x)` / `pop()` | add / remove at the end | yes |
| `unshift(x)` / `shift()` | add / remove at the front (slow on big arrays) | yes |
| `splice(i, n, ...items)` | remove `n` at `i`, insert items | yes |
| `sort(fn)` / `reverse()` / `fill(v)` | reorder or overwrite | yes |
| `slice(start, end)` | copy of a part | no |
| `map` / `filter` / `concat` | new array | no |
| `toSorted(fn)` / `toReversed()` | sorted or reversed copy | no |
| `join(sep)` | string of the items | no |
| `Array.isArray(x)` | true for arrays (`typeof` says `"object"`) | no |

### Use it in a loop

```javascript
const scores = [72, 95, 88, 61];
let best = -Infinity;
const passed = [];
for (const s of scores) {
  if (s > best) best = s;
  if (s >= 70) passed.push(s);
}
console.log(best);              // 95
console.log(passed.join(", ")); // 72, 95, 88
```

### Gotchas

- `sort()` without a compare function sorts as strings: `[10, 9, 1]` becomes `[1, 10, 9]`. Pass `(x, y) => x - y` for numbers.
- `===` compares arrays by reference: `[1, 2] === [1, 2]` is `false`. Compare item by item or with `JSON.stringify`.
- `const` stops reassigning the name, not changing the contents: `const a = []` then `a.push(1)` is fine.
- `new Array(3)` makes 3 empty holes that `map` skips. Use `new Array(3).fill(0)` or `Array.from`.
