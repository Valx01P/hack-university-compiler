# Two Pointers and Windows

Two indexes over one array or string turn a nested loop into one pass: from both ends moving inward, a read index and a write index, or a window whose edges only move forward. Here `nums[i]` is `number | undefined` and `s[i]` is `string | undefined`, so give a default with `??`, loop with `for...of`, or read strings with `s.charAt(i)`, which is always a `string` (`""` past the end).

### Both ends: two sum on a sorted array

```typescript
const nums = [2, 7, 11, 15];
const target = 18;
let i = 0;
let j = nums.length - 1;
while (i < j) {
  const sum = (nums[i] ?? 0) + (nums[j] ?? 0);  // i and j stay in range, ?? only satisfies the type
  if (sum === target) break;
  if (sum < target) i++;  // need more, move the small end up
  else j--;               // need less, move the big end down
}
console.log(i < j ? `${i + 1} ${j + 1}` : "none");  // 2 3, as 1-based indexes
```

### Both ends: a palindrome, skipping punctuation

```typescript
const isAlnum = (ch: string): boolean => /[a-z0-9]/i.test(ch);
function isPalindrome(s: string): boolean {
  let i = 0;
  let j = s.length - 1;
  while (i < j) {
    const [a, b] = [s.charAt(i), s.charAt(j)];
    if (!isAlnum(a)) i++;
    else if (!isAlnum(b)) j--;
    else if (a.toLowerCase() !== b.toLowerCase()) return false;
    else {
      i++;
      j--;
    }
  }
  return true;
}
console.log(isPalindrome("A man, a plan, a canal: Panama"));  // true
console.log(isPalindrome("race a car"));                      // false
```

### Swap in place

`[a[i], a[j]] = [a[j], a[i]]` is TS2322 here, since each read may be `undefined`. A small generic `swap` checks both.

```typescript
function swap<T>(xs: T[], i: number, j: number): void {
  const x = xs[i];
  const y = xs[j];
  if (x === undefined || y === undefined) return;
  xs[i] = y;
  xs[j] = x;
}
const a = [1, 2, 3, 4, 5];
for (let i = 0, j = a.length - 1; i < j; i++, j--) swap(a, i, j);
console.log(a.join(" "));  // 5 4 3 2 1
```

### Read and write: move zeroes, remove duplicates

`for...of` and `entries()` hand you each value as a `number`, so writing it back needs no check.

```typescript
const nums = [0, 1, 0, 3, 12];
let write = 0;
for (const x of nums) {
  if (x !== 0) nums[write++] = x;  // keep it, in order
}
nums.fill(0, write);               // zero the rest
console.log(nums.join(" "));       // 1 3 12 0 0

const sorted = [1, 1, 2, 3, 3];
let k = 0;
for (const [r, x] of sorted.entries()) {
  if (r === 0 || x !== sorted[r - 1]) sorted[k++] = x;
}
console.log(k, sorted.slice(0, k).join(" "));  // 3 1 2 3
```

### Two strings at once: is a subsequence

```typescript
function isSubsequence(s: string, t: string): boolean {  // are s's letters in t, in order?
  let p = 0;
  for (let q = 0; q < t.length && p < s.length; q++) {
    if (s.charAt(p) === t.charAt(q)) p++;
  }
  return p === s.length;
}
console.log(isSubsequence("ace", "abcde"), isSubsequence("aec", "abcde"));  // true false
```

### Fixed window: the best k in a row

```typescript
const nums = [2, 1, 5, 1, 3, 2];
const k = 3;
let windowSum = nums.slice(0, k).reduce((sum, x) => sum + x, 0);
let best = windowSum;
for (let i = k; i < nums.length; i++) {
  windowSum += (nums[i] ?? 0) - (nums[i - k] ?? 0);  // add the new one, drop the oldest
  best = Math.max(best, windowSum);
}
console.log(best);  // 9
```

### Variable window with a Map: longest substring without repeats

A `Map<string, number>` remembers where each character was last seen. On a repeat inside the window, jump the left edge past it.

```typescript
function longestUnique(s: string): number {
  const lastSeen = new Map<string, number>();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s.charAt(right);
    const seen = lastSeen.get(ch);  // number | undefined
    if (seen !== undefined && seen >= left) left = seen + 1;
    lastSeen.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
console.log(longestUnique("abcabcbb"), longestUnique("pwwkew"));  // 3 3
```

### Counts in a window: at most k distinct letters

Add the letter on the right, and while the window breaks the rule, take letters off the left. Delete a letter whose count drops to `0`, so `counts.size` is the number of distinct letters inside.

```typescript
function longestWithKDistinct(s: string, k: number): number {
  const counts = new Map<string, number>();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s.charAt(right);
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    while (counts.size > k) {
      const out = s.charAt(left++);
      const n = (counts.get(out) ?? 0) - 1;
      if (n === 0) counts.delete(out);
      else counts.set(out, n);
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}
console.log(longestWithKDistinct("eceba", 2), longestWithKDistinct("aabbcc", 1));  // 3 2
```

### Variable window: the shortest run with a sum of at least target

```typescript
const nums = [2, 3, 1, 2, 4, 3];
const target = 7;
let left = 0;
let sum = 0;
let best = Infinity;
for (const [right, x] of nums.entries()) {
  sum += x;
  while (sum >= target) {
    best = Math.min(best, right - left + 1);
    sum -= nums[left++] ?? 0;  // shrink from the left while it still works
  }
}
console.log(best === Infinity ? 0 : best);  // 2
```

### Letter counts in an array: find all anagrams

```typescript
const s = "cbaebabacd";
const p = "abc";
const need = new Array<number>(26).fill(0);
const have = new Array<number>(26).fill(0);
const bump = (counts: number[], ch: string, by: number): void => {
  const i = ch.charCodeAt(0) - 97;  // "a" is 0, "z" is 25
  counts[i] = (counts[i] ?? 0) + by;
};
for (const ch of p) bump(need, ch, 1);
const starts: number[] = [];
for (let i = 0; i < s.length; i++) {
  bump(have, s.charAt(i), 1);
  if (i >= p.length) bump(have, s.charAt(i - p.length), -1);  // the letter that left
  if (i >= p.length - 1 && have.every((c, x) => c === need[x])) starts.push(i - p.length + 1);
}
console.log(starts.join(" "));  // 0 6
```

### Prefix sums

`prefix[i]` is the sum of the first `i` items, so any range sum is one subtraction.

```typescript
const nums = [3, 1, 4, 1, 5];
const prefix = [0];
for (const x of nums) prefix.push((prefix.at(-1) ?? 0) + x);
console.log(prefix.join(" "));  // 0 3 4 8 9 14
const rangeSum = (l: number, r: number): number => (prefix[r + 1] ?? 0) - (prefix[l] ?? 0);  // nums[l] through nums[r]
console.log(rangeSum(1, 3));    // 6
```

### Prefix sums with a Map: subarrays that sum to k

A run ending here sums to `k` when an earlier prefix was `sum - k`. Count the prefixes seen so far in a `Map<number, number>`.

```typescript
const nums = [1, 2, 3, -2, 2];
const k = 3;
const seen = new Map<number, number>([[0, 1]]);  // the empty prefix
let sum = 0;
let count = 0;
for (const x of nums) {
  sum += x;
  count += seen.get(sum - k) ?? 0;
  seen.set(sum, (seen.get(sum) ?? 0) + 1);
}
console.log(count);  // 4
```

### Prefix and suffix products

```typescript
const nums = [1, 2, 3, 4];
const out = new Array<number>(nums.length).fill(1);
let before = 1;
for (const [i, x] of nums.entries()) {
  out[i] = before;                 // the product of everything to the left
  before *= x;
}
let after = 1;
for (let i = nums.length - 1; i >= 0; i--) {
  out[i] = (out[i] ?? 1) * after;  // times everything to the right
  after *= nums[i] ?? 1;
}
console.log(out.join(" "));        // 24 12 8 6
```

### Which pattern

| Problem says | Reach for |
| --- | --- |
| sorted array, a pair with a sum | two pointers from both ends |
| in place, keep the order | a read index and a write index |
| k items in a row | a fixed window, add one and drop one |
| longest or shortest run that ... | a variable window, grow right, shrink left |
| any range sum, many queries | prefix sums |
| count runs with sum k (negatives allowed) | prefix sums and a `Map<number, number>` of counts |

### Gotchas

- `counts[i]++`, `counts[i] += 1`, and `[a[i], a[j]] = [a[j], a[i]]` don't compile here. Read into a `const`, or write `counts[i] = (counts[i] ?? 0) + 1`.
- `map.get(k) + 1` is TS2532, and in plain JavaScript it would be `NaN`. Count with `(map.get(k) ?? 0) + 1`.
- `s[i]` is `string | undefined`, while `s.charAt(i)` is a `string` and `s.charCodeAt(i)` a `number` (`NaN` past the end). Strings can't be changed by index at all.
- A shrinking window on sums needs positive numbers, so that growing the window always grows the sum. With negatives, use prefix sums and a Map.
