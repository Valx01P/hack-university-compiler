# Binary Search

JavaScript has no built-in binary search: `indexOf`, `includes`, and `find` scan from the start, O(n). On a sorted array you write the search yourself. Each step halves the range, so it takes O(log n) steps. There is no lower bound or upper bound call either, and they are the same loop with a different test.

### Exact match

```javascript
function binarySearch(a, target) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] === target) return mid;
    if (a[mid] < target) lo = mid + 1;  // the target is to the right
    else hi = mid - 1;                  // the target is to the left
  }
  return -1;
}
const a = [-1, 0, 3, 5, 9, 12];
console.log(binarySearch(a, 9));  // 4
console.log(binarySearch(a, 2));  // -1
```

### Lower bound and upper bound

The lower bound is the first index whose value is `>= target`, which is also where `target` would be inserted. The upper bound is the first index whose value is `> target`. Both return `a.length` when no value qualifies.

```javascript
function lowerBound(a, target) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(a, target) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] <= target) lo = mid + 1;
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
console.log(upperBound(a, 0));                     // 0, everything is bigger
```

### First and last position

```javascript harness
function lowerBound(a, target) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBound(a, target) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
{{code}}
```

```javascript
function firstAndLast(a, target) {
  const first = lowerBound(a, target);
  if (first === a.length || a[first] !== target) return [-1, -1];  // not there
  return [first, upperBound(a, target) - 1];
}
console.log(firstAndLast([5, 7, 7, 8, 8, 10], 8));  // [ 3, 4 ]
console.log(firstAndLast([5, 7, 7, 8, 8, 10], 6));  // [ -1, -1 ]
```

### The first index where a test turns true

Every bound is this one loop. It works whenever the test is false, false, ..., then true, true, ... across the range.

```javascript
function firstTrue(lo, hi, ok) {  // in [lo, hi), or hi when it never turns true
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
const a = [1, 3, 3, 6, 8];
console.log(firstTrue(0, a.length, (i) => a[i] >= 3));  // 1, the lower bound of 3
console.log(firstTrue(0, a.length, (i) => a[i] > 3));   // 3, the upper bound of 3
console.log(firstTrue(0, 100, (x) => x * x >= 50));      // 8, the smallest x with x * x >= 50
```

### Binary search on the answer

When a bigger answer always works if a smaller one does, search the answers themselves. The slowest eating speed that finishes the piles within `h` hours:

```javascript
const piles = [3, 6, 7, 11];
const h = 8;
const hoursAt = (speed) => piles.reduce((sum, p) => sum + Math.ceil(p / speed), 0);
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

One half of the range is always sorted. Find which, then check whether the target sits inside it.

```javascript
function searchRotated(a, target) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] === target) return mid;
    if (a[lo] <= a[mid]) {                                // the left half is sorted
      if (a[lo] <= target && target < a[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {                                              // the right half is sorted
      if (a[mid] < target && target <= a[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}
console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 0));  // 4
console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 3));  // -1

function minRotated(a) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] > a[hi]) lo = mid + 1;  // the drop is to the right
    else hi = mid;
  }
  return a[lo];
}
console.log(minRotated([4, 5, 6, 7, 0, 1, 2]));  // 0
```

### The latest value at or before a time

The upper bound minus one is the last entry at or before `t`. A key-value store keeps a sorted `[time, value]` list per key.

```javascript
const history = [[1, "a"], [4, "b"], [9, "c"]];  // sorted by time
function valueAt(t) {
  let lo = 0;
  let hi = history.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (history[mid][0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? "" : history[lo - 1][1];  // nothing that early
}
console.log(valueAt(5), valueAt(9), JSON.stringify(valueAt(0)));  // b c ""
```

### A sorted 2D matrix

Treat the rows as one sorted array of `rows * cols` items.

```javascript
const m = [[1, 3, 5], [7, 10, 11], [16, 20, 23]];
const cols = m[0].length;
let lo = 0;
let hi = m.length * cols - 1;
let found = false;
while (lo <= hi && !found) {
  const mid = Math.floor((lo + hi) / 2);
  const value = m[Math.floor(mid / cols)][mid % cols];  // index to row and column
  if (value === 10) found = true;
  else if (value < 10) lo = mid + 1;
  else hi = mid - 1;
}
console.log(found);  // true
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
- `(lo + hi) >> 1` turns negative once `lo + hi` passes 2^31 - 1, so on big answer ranges (up to 10^9 or more) use `Math.floor((lo + hi) / 2)`.
- Mixing the two shapes (`lo <= hi` with `hi = mid`) loops forever. Keep each template whole.
- `Math.max(...piles)` throws `RangeError` on very large arrays (about 125,000 items here). Use `piles.reduce((m, p) => Math.max(m, p), -Infinity)` there.
