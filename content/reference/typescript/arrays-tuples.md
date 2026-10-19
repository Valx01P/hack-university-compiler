# Arrays and Tuples

An array type says what every element is (`number[]`, or `Array<number>`), and a tuple fixes the length and the type at each position. With `noUncheckedIndexedAccess` on, as here, reading `xs[i]` gives `T | undefined`, because the index may be past the end.

### Create

```typescript
const scores: number[] = [88, 92, 79];
const names: Array<string> = ["Ada", "Ben"];
const tags = ["ts", "node"];
//    ^? const tags: string[]
const cells = ["Ada", 36];
//    ^? const cells: (string | number)[]
const ids: number[] = []; // an empty array: say what it will hold
ids.push(7);
console.log(scores, names); // [ 88, 92, 79 ] [ 'Ada', 'Ben' ]
console.log(tags, cells);   // [ 'ts', 'node' ] [ 'Ada', 36 ]
console.log(ids);           // [ 7 ]
```

### Methods and callbacks are checked

Callbacks get their parameter types from the array, so `s` below is a `number` without an annotation.

```typescript
const scores: number[] = [88, 92, 79];
scores.push(95);
const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
console.log(average); // 88.5
const labels = scores.map((s) => `${s}%`);
//    ^? const labels: string[]
console.log(labels.join(", ")); // 88%, 92%, 79%, 95%
```

```typescript error
const scores: number[] = [88, 92];
scores.push("100"); // TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

### Read by index

```typescript
const scores = [88, 92, 79];
const first = scores[0];
//    ^? const first: number | undefined
if (first !== undefined) {
  console.log(first.toFixed(1)); // 88.0
}
console.log(scores[5] ?? 0);    // 0
console.log(scores.at(-1));     // 79
for (const s of scores) {
  console.log(s * 2);           // 176, then 184, then 158
}
```

```typescript error
const scores = [88, 92, 79];
if (scores.length > 0) {
  console.log(scores[0].toFixed(1)); // TS2532: Object is possibly 'undefined'.
}
```

| Read | Gives |
| --- | --- |
| `xs[i]`, `xs.at(i)` | `T \| undefined` |
| `xs[i] ?? fallback` | `T` |
| `const [a, b] = xs` | `T \| undefined` for each |
| `xs.find(fn)`, `xs.pop()` | `T \| undefined` |
| `for (const x of xs)`, `xs.map((x) => ...)` | `T` |

### readonly arrays

`readonly T[]` (or `ReadonlyArray<T>`) has no `push`, `sort`, or other method that changes it. A parameter typed `readonly T[]` accepts both kinds and promises to leave the caller's array alone.

```typescript
function total(xs: readonly number[]): number {
  return xs.reduce((sum, x) => sum + x, 0);
}
const DAYS: readonly string[] = ["Tue", "Mon", "Wed"];
console.log(DAYS.toSorted(), DAYS); // [ 'Mon', 'Tue', 'Wed' ] [ 'Tue', 'Mon', 'Wed' ]
console.log(total([1, 2, 3]));      // 6
```

```typescript error
const DAYS: readonly string[] = ["Mon", "Tue"];
DAYS.push("Wed"); // TS2339: Property 'push' does not exist on type 'readonly string[]'.
```

### Copy instead of change: toSorted and friends

| Changes the array | Returns a new array |
| --- | --- |
| `xs.sort(fn)` | `xs.toSorted(fn)` |
| `xs.reverse()` | `xs.toReversed()` |
| `xs.splice(i, n, ...items)` | `xs.toSpliced(i, n, ...items)` |
| `xs[i] = value` | `xs.with(i, value)` |

```typescript
const prices = [30, 10, 20];
console.log(prices.toSorted((a, b) => a - b)); // [ 10, 20, 30 ]
console.log(prices.toReversed());              // [ 20, 10, 30 ]
console.log(prices.with(0, 99));               // [ 99, 10, 20 ]
console.log(prices.toSpliced(1, 1));           // [ 30, 20 ]
console.log(prices);                           // [ 30, 10, 20 ]
```

### Tuples: return two values

Names like `lat` and `lng` label the positions in the editor and in errors. At runtime a tuple is a plain array.

```typescript
const home: [lat: number, lng: number] = [51.5, -0.12];
const [lat, lng] = home;
console.log(lat, lng); // 51.5 -0.12

function minMax(xs: number[]): [min: number, max: number] {
  return [Math.min(...xs), Math.max(...xs)];
}
const [lo, hi] = minMax([3, 9, 1]);
//     ^? const lo: number
console.log(lo, hi); // 1 9
```

### Optional and rest elements

```typescript
type Entry = [name: string, qty?: number];
const pen: Entry = ["pen", 3];
const mug: Entry = ["mug"];
console.log(pen.length, mug.length, mug[1] ?? 1); // 2 1 1

type Row = [label: string, ...values: number[]];
const row: Row = ["temps", 12, 15, 9];
const [label, ...values] = row;
//                ^? const values: number[]
console.log(label, values); // temps [ 12, 15, 9 ]
```

### readonly tuples

`readonly [x: number, y: number]` can't be changed at all. An `as const` array is one too (see Literal Types).

```typescript error
const point: readonly [x: number, y: number] = [3, 4];
point[0] = 5; // TS2540: Cannot assign to '0' because it is a read-only property.
```

### Gotchas

- `sort()` and `reverse()` change the array they are called on. Use `toSorted()` and `toReversed()` to get a changed copy instead.
- `xs[i]` stays `T | undefined` even after you check `xs.length`. Check the element itself, use `??`, or loop with `for...of`.
- A tuple that isn't `readonly` still has `push`: `pair.push(3)` compiles and breaks its length. Write `readonly [number, number]`.
- Without a compare function, `toSorted()` and `sort()` order numbers as text: `[10, 9, 1].toSorted()` is `[ 1, 10, 9 ]`.
