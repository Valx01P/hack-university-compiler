# Sorting with Typed Comparators

`xs.sort(compare)` sorts in place and returns the same array, and `xs.toSorted(compare)` returns a sorted copy. The compare function is `(a: T, b: T) => number`, and TypeScript infers `a` and `b` from the array: a negative result puts `a` first, a positive one puts `b` first, and `0` is a tie. Without one, every element is compared as a string, numbers too. Sorting is stable.

### Numbers: ascending and descending

```typescript
const nums = [10, 9, 1, 100, 25];
console.log(nums.toSorted());                 // [ 1, 10, 100, 25, 9 ], compared as strings!
console.log(nums.toSorted((a, b) => a - b));  // [ 1, 9, 10, 25, 100 ]
console.log(nums.toSorted((a, b) => b - a));  // [ 100, 25, 10, 9, 1 ]
const same = nums.sort((a, b) => a - b);      // in place
console.log(same === nums, nums);             // true [ 1, 9, 10, 25, 100 ]
```

The compare function must return a number, and `tsc` catches one that doesn't:

```typescript error
const nums = [3, 1, 2];
nums.sort((a, b) => a > b);
// TS2345: Argument of type '(a: number, b: number) => boolean' is not assignable to parameter of type '(a: number, b: number) => number'.
```

### Strings

```typescript
const words = ["pear", "Zebra", "apple"];
console.log(words.toSorted());                              // [ 'Zebra', 'apple', 'pear' ], by code unit
console.log(words.toSorted((a, b) => a.localeCompare(b)));  // [ 'apple', 'pear', 'Zebra' ]
console.log(words.toSorted((a, b) => b.localeCompare(a)));  // [ 'Zebra', 'pear', 'apple' ]

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
console.log(["b", "B", "a"].sort(byCode));                  // [ 'B', 'a', 'b' ], like Java, C++, and Python
console.log([..."listen"].sort().join(""));                 // eilnst, a key for anagrams
```

### Two keys with ||

A tie gives `0`, which is falsy, so `||` moves on to the next rule. The result is still a `number`.

```typescript
const words = ["kiwi", "fig", "banana", "apple", "date"];
words.sort((a, b) => a.length - b.length || a.localeCompare(b));  // by length, then alphabetically
console.log(words.join(" "));  // fig date kiwi apple banana
```

### Tuples for intervals

Type an interval as `[number, number]`, not `number[]`. Reading a tuple at a fixed position gives `number`, while `number[]` gives `number | undefined` at every index.

```typescript
type Interval = [start: number, end: number];
const meetings: Interval[] = [[9, 10], [1, 3], [4, 8], [2, 6]];
meetings.sort((a, b) => a[0] - b[0]);  // by start
console.log(JSON.stringify(meetings)); // [[1,3],[2,6],[4,8],[9,10]]

let canAttendAll = true;
let prevEnd = -Infinity;
for (const [start, end] of meetings) {
  if (start < prevEnd) canAttendAll = false;
  prevEnd = end;
}
console.log(canAttendAll);             // false, [2,6] starts inside [1,3]

const byEnd: Interval[] = [[1, 9], [2, 3], [4, 5]];
byEnd.sort((a, b) => a[1] - b[1]);     // by end, the second column
console.log(JSON.stringify(byEnd));    // [[2,3],[4,5],[1,9]]

const pairs: Interval[] = [[2, 5], [1, 9], [2, 1], [1, 3]];
pairs.sort((a, b) => a[0] - b[0] || b[1] - a[1]);  // start ascending, then end descending
console.log(JSON.stringify(pairs));    // [[1,9],[1,3],[2,5],[2,1]]
```

```typescript error
const meetings: number[][] = [[9, 10], [1, 3]];
meetings.sort((a, b) => a[0] - b[0]); // TS2532: Object is possibly 'undefined'.
```

### Merge intervals

```typescript
type Interval = [start: number, end: number];
const intervals: Interval[] = [[8, 10], [1, 3], [2, 6], [15, 18]];
intervals.sort((a, b) => a[0] - b[0]);
const merged: Interval[] = [];
for (const [start, end] of intervals) {
  const last = merged.at(-1);
  if (last !== undefined && start <= last[1]) {
    last[1] = Math.max(last[1], end);  // overlap: stretch the last one
  } else {
    merged.push([start, end]);         // a gap: start a new one
  }
}
console.log(JSON.stringify(merged));   // [[1,6],[8,10],[15,18]]
```

### Objects by a field

```typescript
type Person = { name: string; age: number };
const people: Person[] = [
  { name: "Cy", age: 30 },
  { name: "Ana", age: 25 },
  { name: "Ben", age: 30 },
];
people.sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));  // age high to low, then name
console.log(people.map((p) => `${p.name} ${p.age}`).join(", "));       // Ben 30, Cy 30, Ana 25

type Point = [x: number, y: number];
const dist2 = ([x, y]: Point): number => x * x + y * y;
const points: Point[] = [[3, 3], [1, -2], [-2, 2]];
points.sort((p, q) => dist2(p) - dist2(q));  // by a computed key
console.log(JSON.stringify(points));         // [[1,-2],[-2,2],[3,3]]
```

### A Map's entries by value

`[...counts]` is a `[string, number][]`, so the compare function can destructure each entry.

```typescript
const counts = new Map<string, number>();
for (const w of "the cat and the hat and the bat".split(" ")) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
const ranked = [...counts].sort(([wa, ca], [wb, cb]) => cb - ca || wa.localeCompare(wb));
console.log(ranked.map(([w, c]) => `${w} ${c}`).join(", "));  // the 3, and 2, bat 1, cat 1, hat 1
console.log(ranked.slice(0, 2).map(([w]) => w));              // [ 'the', 'and' ], the top 2

const stock: Record<string, number> = { pears: 2, apples: 7, figs: 1 };
console.log(Object.entries(stock).sort((a, b) => a[1] - b[1]));  // [ [ 'figs', 1 ], [ 'pears', 2 ], [ 'apples', 7 ] ]
```

### A custom order: the largest number

Put `a` first when `a + b` makes the bigger string. Compare the strings, since numbers that long lose precision.

```typescript
const nums = [3, 30, 34, 5, 9];
const parts = nums.map(String).sort((a, b) => (a + b > b + a ? -1 : a + b < b + a ? 1 : 0));
const joined = parts.join("");
console.log(joined.startsWith("0") ? "0" : joined);  // 9534330 (all zeros print as one 0)
```

### Stability

```typescript
const tasks: [name: string, priority: number][] = [["write", 2], ["test", 1], ["ship", 2], ["plan", 1]];
const byPriority = tasks.toSorted((a, b) => a[1] - b[1]);
console.log(byPriority.map(([t]) => t).join(" "));  // test plan write ship, ties keep their order
```

### Merge sort (divide and conquer)

Split in half, sort each half, then merge them with two indexes. The reads `left[i]` and `right[j]` are `number | undefined`, so the loop checks them instead of trusting the bounds. O(n log n), and `<=` keeps it stable.

```typescript
function mergeSort(a: readonly number[]): number[] {
  if (a.length <= 1) return [...a];
  const mid = Math.floor(a.length / 2);
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  const out: number[] = [];
  let i = 0;
  let j = 0;
  for (;;) {
    const x = left[i];
    const y = right[j];
    if (x === undefined || y === undefined) break;  // one side is used up
    if (x <= y) {
      out.push(x);
      i++;
    } else {
      out.push(y);
      j++;
    }
  }
  return [...out, ...left.slice(i), ...right.slice(j)];
}
console.log(mergeSort([5, 2, 4, 6, 1, 3]).join(" "));  // 1 2 3 4 5 6
```

### Sweep line: rooms in use at once

Sort the starts and the ends on their own, then walk the starts. A meeting that ends at 10 frees its room for one that starts at 10.

```typescript
const meetings: [number, number][] = [[0, 30], [5, 10], [15, 20], [10, 15]];
const starts = meetings.map(([s]) => s).sort((a, b) => a - b);
const ends = meetings.map(([, e]) => e).sort((a, b) => a - b);
let rooms = 0;
let e = 0;
for (const s of starts) {
  if (s >= (ends[e] ?? Infinity)) e++;  // a room freed up, reuse it
  else rooms++;                         // every room is busy, open one more
}
console.log(rooms);  // 2
```

### Calls

| Call | Does |
| --- | --- |
| `xs.sort()` | in place, as strings (only right for strings) |
| `xs.sort((a, b) => a - b)` | numbers ascending, `b - a` for descending |
| `xs.sort((a, b) => a.localeCompare(b))` | words in dictionary order |
| `xs.sort((a, b) => a[0] - b[0])` | `[number, number]` tuples by their first item |
| `xs.toSorted(fn)`, `xs.toReversed()` | a sorted or reversed copy, `xs` unchanged |
| `[...map].sort(fn)` | a `Map`'s entries as sorted `[key, value]` pairs |
| `Object.entries(o).sort(fn)` | an object's entries as sorted pairs |

`sort` and `toSorted` are O(n log n) and stable.

### Gotchas

- `sort()` with no compare function compares as strings: `[10, 9, 1]` becomes `[1, 10, 9]`. The types don't catch it, since the call is valid.
- Rows typed `number[][]` make `a[0] - b[0]` TS2532. Type them as tuples, `[number, number][]`, and `a[0]` is a `number`.
- `sort` changes the array and returns the same one. A `readonly number[]` has no `sort` at all (TS2339), so use `toSorted` there.
- `localeCompare` puts `"a"` before `"B"`, while `<` and the default sort put `"B"` first. When a problem says lexicographic and mixes cases, compare with `<`.
