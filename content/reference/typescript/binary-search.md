# Binary Search by Hand

There's no built-in binary search: `indexOf`, `includes`, and `find` scan from the start, O(n). On a sorted array you write the loop yourself, and each step halves the range, O(log n). With `noUncheckedIndexedAccess`, `a[mid]` is `number | undefined` even though `mid` is always in range, so read it into a `const` and check it before you compare.

### Reading a[mid]

```typescript error
const a = [1, 3, 5];
const mid = 1;
if (a[mid] < 4) console.log("left"); // TS2532: Object is possibly 'undefined'.
```

Three honest ways past it: check the value, give a default with `??` that can never win, or a small checked read that throws if the index is ever wrong.

```typescript
const a = [1, 3, 5];
const mid = 1;
const value = a[mid];
if (value !== undefined && value < 4) console.log("left");  // left
console.log((a[7] ?? Infinity) < 4);                         // false

function at(xs: readonly number[], i: number): number {
  const x = xs[i];
  if (x === undefined) throw new RangeError(`index ${i} is outside 0..${xs.length - 1}`);
  return x;
}
console.log(at(a, 2));  // 5
```

`a[mid]!` also compiles, but it checks nothing, so a wrong index turns into `undefined` comparisons that are quietly false.

### Exact match

```typescript
function binarySearch(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const value = a[mid];
    if (value === target) return mid;
    if (value !== undefined && value < target) lo = mid + 1;  // the target is to the right
    else hi = mid - 1;                                        // the target is to the left
  }
  return -1;
}
const a = [-1, 0, 3, 5, 9, 12];
console.log(binarySearch(a, 9));  // 4
console.log(binarySearch(a, 2));  // -1
```

### Lower bound and upper bound

The lower bound is the first index whose value is `>= target`, which is also where `target` would be inserted. The upper bound is the first index whose value is `> target`. Both return `a.length` when no value qualifies.

```typescript
function lowerBound(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((a[mid] ?? Infinity) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((a[mid] ?? Infinity) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const a = [1, 2, 2, 2, 5, 7];
console.log(lowerBound(a, 2));                     // 1
console.log(upperBound(a, 2));                     // 4
console.log(upperBound(a, 2) - lowerBound(a, 2));  // 3, how many 2s
console.log(lowerBound(a, 4));                     // 4, where 4 would go (search insert position)
console.log(lowerBound(a, 9));                     // 6, past the end
```

### First and last position

```typescript harness
function lowerBound(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((a[mid] ?? Infinity) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBound(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((a[mid] ?? Infinity) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
{{code}}
```

```typescript
function firstAndLast(a: readonly number[], target: number): [first: number, last: number] {
  const first = lowerBound(a, target);
  if (a[first] !== target) return [-1, -1];  // past the end reads undefined, which isn't target
  return [first, upperBound(a, target) - 1];
}
console.log(firstAndLast([5, 7, 7, 8, 8, 10], 8));  // [ 3, 4 ]
console.log(firstAndLast([5, 7, 7, 8, 8, 10], 6));  // [ -1, -1 ]
```

### The first index where a test turns true

Every bound is this one loop. It works whenever the test is false, false, ..., then true, true, ... across the range, and it reads no array itself.

```typescript
function firstTrue(lo: number, hi: number, ok: (i: number) => boolean): number {  // in [lo, hi), or hi
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
const a = [1, 3, 3, 6, 8];
console.log(firstTrue(0, a.length, (i) => (a[i] ?? Infinity) >= 3));  // 1, the lower bound of 3
console.log(firstTrue(0, a.length, (i) => (a[i] ?? Infinity) > 3));   // 3, the upper bound of 3
console.log(firstTrue(0, 100, (x) => x * x >= 50));                   // 8, the smallest x with x * x >= 50
```

### Binary search on the answer

When a bigger answer always works if a smaller one does, search the answers themselves. The slowest eating speed that finishes the piles within `h` hours:

```typescript
const piles = [3, 6, 7, 11];
const h = 8;
const hoursAt = (speed: number): number => piles.reduce((sum, p) => sum + Math.ceil(p / speed), 0);
let lo = 1;
let hi = Math.max(...piles);
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (hoursAt(mid) <= h) hi = mid;  // fast enough, try slower
  else lo = mid + 1;                // too slow
}
console.log(lo);  // 4
console.log(Math.ceil(7 / 2), Math.floor((7 + 2 - 1) / 2));  // 4 4, two ways to round a division up
```

### Search a rotated sorted array

One half of the range is always sorted. Find which, then check whether the target sits inside it. A checked read keeps the comparisons plain.

```typescript
function at(xs: readonly number[], i: number): number {
  const x = xs[i];
  if (x === undefined) throw new RangeError(`index ${i} is outside 0..${xs.length - 1}`);
  return x;
}

function searchRotated(a: readonly number[], target: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const [left, middle, right] = [at(a, lo), at(a, mid), at(a, hi)];
    if (middle === target) return mid;
    if (left <= middle) {                                      // the left half is sorted
      if (left <= target && target < middle) hi = mid - 1;
      else lo = mid + 1;
    } else {                                                   // the right half is sorted
      if (middle < target && target <= right) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}
console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 0));  // 4
console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 3));  // -1

function minRotated(a: readonly number[]): number {  // the smallest value, where the rotation starts
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(a, mid) > at(a, hi)) lo = mid + 1;        // the drop is to the right
    else hi = mid;
  }
  return at(a, lo);
}
console.log(minRotated([4, 5, 6, 7, 0, 1, 2]));      // 0
```

### The latest value at or before a time

The upper bound minus one is the last entry at or before `t`. A key-value store keeps a sorted `[time, value]` list per key.

```typescript
const history: [time: number, value: string][] = [[1, "a"], [4, "b"], [9, "c"]];
function valueAt(t: number): string {
  let lo = 0;
  let hi = history.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const entry = history[mid];
    if (entry !== undefined && entry[0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return history[lo - 1]?.[1] ?? "";  // nothing that early: index -1 reads undefined
}
console.log(valueAt(5), valueAt(9), JSON.stringify(valueAt(0)));  // b c ""
```

### Which loop

| Search | Range | Loop | Move |
| --- | --- | --- | --- |
| exact match | `hi = n - 1` | `lo <= hi` | `lo = mid + 1` or `hi = mid - 1`, return on a hit |
| lower bound, first `>= x` | `hi = n` | `lo < hi` | `a[mid] < x` then `lo = mid + 1`, else `hi = mid` |
| upper bound, first `> x` | `hi = n` | `lo < hi` | `a[mid] <= x` then `lo = mid + 1`, else `hi = mid` |
| smallest answer that works | the answer's range | `lo < hi` | `ok(mid)` then `hi = mid`, else `lo = mid + 1` |

### Gotchas

- Sort numbers with a compare function first. The default `sort()` gives `[1, 10, 2]`, and a binary search over that is wrong without an error.
- `a[mid] < target` is TS2532 here. Pick one fix for the whole loop: a `const` and a check, `?? Infinity` (which can never be the answer), or a checked read.
- `(lo + hi) >> 1` turns negative once `lo + hi` passes 2^31 - 1, so on big answer ranges (up to 10^9 or more) use `Math.floor((lo + hi) / 2)`.
- Mixing the two shapes (`lo <= hi` with `hi = mid`) loops forever. Keep each template whole.
