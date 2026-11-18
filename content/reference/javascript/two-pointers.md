# Two Pointers and Windows

Two indexes over one array or string turn a nested loop into one pass: from both ends moving inward, a read index and a write index, or a window whose left and right edges only move forward. Strings index like arrays (`s[i]`, `s.length`), and a `Map`, a `Set`, or a count array holds what is inside the window.

### Both ends: two sum on a sorted array

```javascript
const nums = [2, 7, 11, 15];
const target = 18;
let i = 0;
let j = nums.length - 1;
while (i < j) {
  const sum = nums[i] + nums[j];
  if (sum === target) break;
  if (sum < target) i++;  // need more, move the small end up
  else j--;               // need less, move the big end down
}
console.log(i < j ? `${i + 1} ${j + 1}` : "none");  // 2 3, as 1-based indexes
```

### Both ends: a palindrome, skipping punctuation

```javascript
const isAlnum = (ch) => /[a-z0-9]/i.test(ch);
function isPalindrome(s) {
  let i = 0;
  let j = s.length - 1;
  while (i < j) {
    if (!isAlnum(s[i])) i++;
    else if (!isAlnum(s[j])) j--;
    else if (s[i].toLowerCase() !== s[j].toLowerCase()) return false;
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

### Reverse in place with a swap

```javascript
const a = [1, 2, 3, 4, 5];
for (let i = 0, j = a.length - 1; i < j; i++, j--) {
  [a[i], a[j]] = [a[j], a[i]];  // swap by destructuring
}
console.log(a.join(" "));  // 5 4 3 2 1
```

### Read and write: move zeroes, remove duplicates

```javascript
const nums = [0, 1, 0, 3, 12];
let write = 0;
for (const x of nums) {
  if (x !== 0) nums[write++] = x;  // keep it, in order
}
nums.fill(0, write);               // zero the rest
console.log(nums.join(" "));       // 1 3 12 0 0

const sorted = [1, 1, 2, 3, 3];
let k = 0;
for (let r = 0; r < sorted.length; r++) {
  if (r === 0 || sorted[r] !== sorted[r - 1]) sorted[k++] = sorted[r];
}
console.log(k, sorted.slice(0, k).join(" "));  // 3 1 2 3
```

### Two arrays or strings at once

```javascript
const a = [1, 4, 7];
const b = [2, 3, 8, 9];
const out = [];
let i = 0;
let j = 0;
while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]);
while (i < a.length) out.push(a[i++]);
while (j < b.length) out.push(b[j++]);
console.log(out.join(" "));  // 1 2 3 4 7 8 9

function isSubsequence(s, t) {  // are s's letters in t, in order?
  let p = 0;
  for (let q = 0; q < t.length && p < s.length; q++) {
    if (s[p] === t[q]) p++;
  }
  return p === s.length;
}
console.log(isSubsequence("ace", "abcde"), isSubsequence("aec", "abcde"));  // true false
```

### Fixed window: the best k in a row

```javascript
const nums = [2, 1, 5, 1, 3, 2];
const k = 3;
let windowSum = 0;
for (let i = 0; i < k; i++) windowSum += nums[i];
let best = windowSum;
for (let i = k; i < nums.length; i++) {
  windowSum += nums[i] - nums[i - k];  // add the new one, drop the oldest
  best = Math.max(best, windowSum);
}
console.log(best);  // 9
```

### Variable window with a Map: longest substring without repeats

Remember where each character was last seen. On a repeat inside the window, jump the left edge past it.

```javascript
function longestUnique(s) {
  const lastSeen = new Map();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (lastSeen.has(ch) && lastSeen.get(ch) >= left) left = lastSeen.get(ch) + 1;
    lastSeen.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
console.log(longestUnique("abcabcbb"));  // 3
console.log(longestUnique("pwwkew"));    // 3

const s = "abba";
const inWindow = new Set();  // the same with a Set: shrink until the repeat is gone
let left = 0;
let best = 0;
for (let right = 0; right < s.length; right++) {
  while (inWindow.has(s[right])) inWindow.delete(s[left++]);
  inWindow.add(s[right]);
  best = Math.max(best, right - left + 1);
}
console.log(best);  // 2
```

### Variable window: the shortest run with a sum of at least target

```javascript
const nums = [2, 3, 1, 2, 4, 3];
const target = 7;
let left = 0;
let sum = 0;
let best = Infinity;
for (let right = 0; right < nums.length; right++) {
  sum += nums[right];
  while (sum >= target) {
    best = Math.min(best, right - left + 1);
    sum -= nums[left++];  // shrink from the left while it still works
  }
}
console.log(best === Infinity ? 0 : best);  // 2
```

### Letter counts in a window: find all anagrams

```javascript
const s = "cbaebabacd";
const p = "abc";
const code = (ch) => ch.charCodeAt(0) - 97;  // "a" is 0, "z" is 25
const need = new Array(26).fill(0);
const have = new Array(26).fill(0);
for (const ch of p) need[code(ch)]++;
const starts = [];
for (let i = 0; i < s.length; i++) {
  have[code(s[i])]++;
  if (i >= p.length) have[code(s[i - p.length])]--;  // the letter that left
  if (i >= p.length - 1 && have.every((c, x) => c === need[x])) starts.push(i - p.length + 1);
}
console.log(starts.join(" "));  // 0 6
```

### Prefix sums

`prefix[i]` is the sum of the first `i` items, so any range sum is one subtraction.

```javascript
const nums = [3, 1, 4, 1, 5];
const prefix = [0];
for (const x of nums) prefix.push(prefix.at(-1) + x);
console.log(prefix.join(" "));  // 0 3 4 8 9 14
const rangeSum = (l, r) => prefix[r + 1] - prefix[l];  // nums[l] through nums[r]
console.log(rangeSum(1, 3));    // 6
```

### Prefix sums with a Map: subarrays that sum to k

A run ending here sums to `k` when an earlier prefix was `sum - k`. Count the prefixes seen so far.

```javascript
const nums = [1, 2, 3, -2, 2];
const k = 3;
const seen = new Map([[0, 1]]);  // the empty prefix
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

```javascript
const nums = [1, 2, 3, 4];
const out = new Array(nums.length).fill(1);
let before = 1;
for (let i = 0; i < nums.length; i++) {
  out[i] = before;   // the product of everything to the left
  before *= nums[i];
}
let after = 1;
for (let i = nums.length - 1; i >= 0; i--) {
  out[i] *= after;   // times everything to the right
  after *= nums[i];
}
console.log(out.join(" "));  // 24 12 8 6
```

### Which pattern

| Problem says | Reach for |
| --- | --- |
| sorted array, a pair with a sum | two pointers from both ends |
| in place, keep the order | a read index and a write index |
| k items in a row | a fixed window, add one and drop one |
| longest or shortest run that ... | a variable window, grow right, shrink left |
| any range sum, many queries | prefix sums |
| count runs with sum k (negatives allowed) | prefix sums and a Map of counts |

### Gotchas

- A Map's missing key gives `undefined`, and `undefined + 1` is `NaN`. Count with `(m.get(k) ?? 0) + 1`.
- Strings can't be changed by index: `s[0] = "x"` does nothing. Spread into an array, swap, then `join("")`.
- `for (const ch of s)` gives no index. Use an index loop when the window needs positions.
- A shrinking window on sums needs positive numbers, so that growing the window always grows the sum. With negatives, use prefix sums and a Map.
