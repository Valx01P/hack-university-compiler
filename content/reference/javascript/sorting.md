# Sorting and Comparators

`arr.sort(compare)` sorts the array in place and returns that same array. Without a compare function it turns every item into a string and compares the text, so numbers always need `(a, b) => a - b`. The compare function returns a negative number when `a` goes first, a positive number when `b` goes first, and `0` for a tie. Sorting is stable: items that tie keep their earlier order.

### Numbers: ascending and descending

```javascript
const nums = [10, 9, 1, 100, 25];
console.log(nums.sort());                 // [ 1, 10, 100, 25, 9 ], compared as strings!
console.log(nums.sort((a, b) => a - b));  // [ 1, 9, 10, 25, 100 ] ascending
console.log(nums.sort((a, b) => b - a));  // [ 100, 25, 10, 9, 1 ] descending
console.log(nums.reverse());              // [ 1, 9, 10, 25, 100 ], in place
```

### A sorted copy: toSorted

```javascript
const nums = [3, 1, 2];
const sorted = nums.toSorted((a, b) => a - b);
console.log(sorted, nums);              // [ 1, 2, 3 ] [ 3, 1, 2 ]
const copy = [...nums].sort((a, b) => b - a);  // copy first, then sort
console.log(copy);                      // [ 3, 2, 1 ]
const same = nums.sort((a, b) => a - b);
console.log(same === nums);             // true, sort returns the array itself
console.log(nums.toReversed(), nums);   // [ 3, 2, 1 ] [ 1, 2, 3 ]
```

### Strings

```javascript
const words = ["pear", "Zebra", "apple"];
console.log(words.toSorted());                              // [ 'Zebra', 'apple', 'pear' ], by code unit
console.log(words.toSorted((a, b) => a.localeCompare(b)));  // [ 'apple', 'pear', 'Zebra' ], dictionary order
console.log(words.toSorted((a, b) => b.localeCompare(a)));  // [ 'Zebra', 'pear', 'apple' ], reversed

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);      // the same order as Java, C++, and Python
console.log(["b", "B", "a"].sort(byCode));                  // [ 'B', 'a', 'b' ]
console.log(["file10", "file2"].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))); // [ 'file2', 'file10' ]

const letters = [..."listen"].sort().join("");
console.log(letters);                                       // eilnst, a key for anagrams
```

### Two keys with ||

A tie gives `0`, which is falsy, so `||` moves on to the next rule.

```javascript
const words = ["kiwi", "fig", "banana", "apple", "date"];
words.sort((a, b) => a.length - b.length || a.localeCompare(b));  // by length, then alphabetically
console.log(words.join(" "));  // fig date kiwi apple banana

const scores = [["ann", 90], ["bob", 85], ["cy", 90], ["dee", 85]];
scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));    // score high to low, then name
console.log(scores.map(([name, s]) => `${name} ${s}`).join(", "));  // ann 90, cy 90, bob 85, dee 85
```

### Arrays of arrays by a column (intervals)

```javascript
const meetings = [[9, 10], [1, 3], [4, 8], [2, 6]];
meetings.sort((a, b) => a[0] - b[0]);              // by start
console.log(JSON.stringify(meetings));             // [[1,3],[2,6],[4,8],[9,10]]
let canAttendAll = true;
for (let i = 1; i < meetings.length; i++) {
  if (meetings[i][0] < meetings[i - 1][1]) canAttendAll = false;
}
console.log(canAttendAll);                         // false, [2,6] starts inside [1,3]

const byEnd = [[1, 9], [2, 3], [4, 5]].sort((a, b) => a[1] - b[1]);  // by the second column
console.log(JSON.stringify(byEnd));                // [[2,3],[4,5],[1,9]]
const pairs = [[2, 5], [1, 9], [2, 1], [1, 3]].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
console.log(JSON.stringify(pairs));                // [[1,9],[1,3],[2,5],[2,1]]
```

### Merge intervals

```javascript
const intervals = [[8, 10], [1, 3], [2, 6], [15, 18]];
intervals.sort((a, b) => a[0] - b[0]);
const merged = [];
for (const [start, end] of intervals) {
  const last = merged.at(-1);
  if (last && start <= last[1]) {
    last[1] = Math.max(last[1], end);  // overlap: stretch the last one
  } else {
    merged.push([start, end]);         // a gap: start a new one
  }
}
console.log(JSON.stringify(merged));   // [[1,6],[8,10],[15,18]]
```

### Objects by a field

```javascript
const people = [
  { name: "Cy", age: 30 },
  { name: "Ana", age: 25 },
  { name: "Ben", age: 30 },
];
people.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
console.log(people.map((p) => `${p.name} ${p.age}`).join(", "));  // Ben 30, Cy 30, Ana 25

const points = [[3, 3], [1, -2], [-2, 2]];
points.sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2));  // by a computed key
console.log(JSON.stringify(points));  // [[1,-2],[-2,2],[3,3]]
```

### A Map's entries by value

```javascript
const counts = new Map();
for (const w of "the cat and the hat and the bat".split(" ")) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(ranked.map(([w, c]) => `${w} ${c}`).join(", "));  // the 3, and 2, bat 1, cat 1, hat 1
console.log(ranked.slice(0, 2).map(([w]) => w));              // [ 'the', 'and' ], the top 2
const sortedMap = new Map(ranked);                            // a Map keeps insertion order
console.log([...sortedMap.keys()].join(" "));                 // the and bat cat hat

const stock = { pears: 2, apples: 7, figs: 1 };
console.log(Object.entries(stock).sort((a, b) => a[1] - b[1]));  // [ [ 'figs', 1 ], [ 'pears', 2 ], [ 'apples', 7 ] ]
```

### A custom order: the largest number

Put `a` first when `a + b` makes the bigger string. Compare the strings, since numbers that long lose precision.

```javascript
const nums = [3, 30, 34, 5, 9];
const parts = nums.map(String).sort((a, b) => (a + b > b + a ? -1 : a + b < b + a ? 1 : 0));
const joined = parts.join("");
console.log(joined[0] === "0" ? "0" : joined);  // 9534330 (all zeros print as one 0)
```

### Stability

```javascript
const tasks = [["write", 2], ["test", 1], ["ship", 2], ["plan", 1]];
const byPriority = tasks.toSorted((a, b) => a[1] - b[1]);
console.log(byPriority.map(([t]) => t).join(" "));  // test plan write ship, ties keep their order
```

### Merge sort (divide and conquer)

Split in half, sort each half, then merge the two sorted halves with two indexes. O(n log n), and `<=` keeps it stable.

```javascript
function mergeSort(a) {
  if (a.length <= 1) return a;
  const mid = Math.floor(a.length / 2);
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    out.push(left[i] <= right[j] ? left[i++] : right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));  // one side has leftovers
}
console.log(mergeSort([5, 2, 4, 6, 1, 3]).join(" "));  // 1 2 3 4 5 6
```

### Sweep line: rooms in use at once

Sort the starts and the ends on their own, then walk the starts. A meeting that ends at 10 frees its room for one that starts at 10.

```javascript
const meetings = [[0, 30], [5, 10], [15, 20], [10, 15]];
const starts = meetings.map((m) => m[0]).sort((a, b) => a - b);
const ends = meetings.map((m) => m[1]).sort((a, b) => a - b);
let rooms = 0;
let e = 0;
for (const s of starts) {
  if (s >= ends[e]) e++;  // a room freed up, reuse it
  else rooms++;           // every room is busy, open one more
}
console.log(rooms);  // 2
```

### Calls

| Call | Does |
| --- | --- |
| `a.sort()` | in place, as strings (only right for an array of strings) |
| `a.sort((x, y) => x - y)` | numbers ascending, `y - x` for descending |
| `a.sort((x, y) => x.localeCompare(y))` | words in dictionary order |
| `a.sort((x, y) => x[0] - y[0])` | arrays by their first column |
| `a.toSorted(fn)` | a sorted copy, `a` unchanged |
| `a.reverse()` / `a.toReversed()` | reverse in place / a reversed copy |
| `[...m].sort(fn)` | a Map's entries as sorted `[key, value]` pairs |
| `Object.entries(o).sort(fn)` | an object's entries as sorted pairs |

`sort` and `toSorted` are O(n log n) and stable (V8 uses TimSort).

### Gotchas

- `sort()` with no compare function compares as strings: `[10, 9, 1]` becomes `[1, 10, 9]`, and `[[10, 1], [9, 2]]` compares `"10,1"` with `"9,2"` and doesn't move.
- The compare function must return a number. `(a, b) => a > b` returns a boolean, and `[3, 1, 2].sort((a, b) => a > b)` stays `[ 3, 1, 2 ]`.
- `sort` changes the array and returns the same one, so `const sorted = a.sort()` is not a copy. Use `toSorted` or `[...a].sort(fn)`.
- `localeCompare` puts `"a"` before `"B"`, while `<` and the default sort put `"B"` first. When a problem says lexicographic and mixes cases, compare with `<`.
