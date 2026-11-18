# Two Pointers and Windows

Two indexes moving through a list or string replace a nested loop: one from each end moving inward, a write index behind a read index, or a window whose left edge follows its right edge. Prefix sums answer "what's the sum of this range" in O(1) after one pass.

### Both ends: two sum on a sorted list

```python
def two_sum_sorted(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total == target:
            return left + 1, right + 1   # 1-based
        if total < target:
            left += 1                    # need a bigger sum
        else:
            right -= 1                   # need a smaller sum
    return -1, -1

print(two_sum_sorted([2, 7, 11, 15], 9))     # (1, 2)
print(two_sum_sorted([1, 3, 4, 6, 8], 10))   # (3, 4)
```

### Both ends: a palindrome, skipping punctuation

```python
def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if not s[left].isalnum():
            left += 1
        elif not s[right].isalnum():
            right -= 1
        elif s[left].lower() != s[right].lower():
            return False
        else:
            left += 1
            right -= 1
    return True

print(is_palindrome("A man, a plan, a canal: Panama"))   # True
print(is_palindrome("race a car"))                       # False
clean = [c.lower() for c in "No 'x' in Nixon" if c.isalnum()]
print(clean == clean[::-1])                              # True  the short way, O(n) memory
```

### Both ends: reverse in place

```python
chars = list("hello")
left, right = 0, len(chars) - 1
while left < right:
    chars[left], chars[right] = chars[right], chars[left]
    left += 1
    right -= 1
print("".join(chars))      # olleh
```

### Read and write: change a list in place

```python
nums = [0, 1, 0, 3, 12]
write = 0
for read in range(len(nums)):
    if nums[read] != 0:
        nums[write], nums[read] = nums[read], nums[write]
        write += 1
print(nums)                # [1, 3, 12, 0, 0]  zeros moved, order kept

nums = [1, 1, 2, 3, 3]     # sorted: drop the duplicates
write = 1
for read in range(1, len(nums)):
    if nums[read] != nums[write - 1]:
        nums[write] = nums[read]
        write += 1
print(nums[:write])        # [1, 2, 3]
```

### Two sequences: merge, subsequence

```python
a, b = [1, 4, 7], [2, 3, 8, 9]
i = j = 0
merged = []
while i < len(a) and j < len(b):
    if a[i] <= b[j]:
        merged.append(a[i])
        i += 1
    else:
        merged.append(b[j])
        j += 1
merged += a[i:] + b[j:]    # whichever is left
print(merged)              # [1, 2, 3, 4, 7, 8, 9]

s, t = "ace", "abcde"
i = 0
for ch in t:
    if i < len(s) and s[i] == ch:
        i += 1
print(i == len(s))         # True  s is a subsequence of t
```

### Fixed window: the best k in a row

```python
nums, k = [2, 1, 5, 1, 3, 2], 3
window = sum(nums[:k])
best = window
for i in range(k, len(nums)):
    window += nums[i] - nums[i - k]    # add the new one, drop the oldest
    best = max(best, window)
print(best)                            # 9
```

### Variable window: longest substring without repeats

The right edge moves every step. The left edge jumps past the last copy of a repeated character.

```python
def longest_unique(s):
    last = {}                          # character -> last index seen
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best

print(longest_unique("abcabcbb"), longest_unique("bbbbb"), longest_unique("pwwkew"))   # 3 1 3
```

The same window with a set, shrinking until the repeat is gone:

```python
s = "pwwkew"
seen = set()
left = best = 0
for right, ch in enumerate(s):
    while ch in seen:
        seen.remove(s[left])
        left += 1
    seen.add(ch)
    best = max(best, right - left + 1)
print(best)                            # 3
```

### Variable window: shortest run with a sum of at least target

```python
nums, target = [2, 3, 1, 2, 4, 3], 7
left = total = 0
best = float("inf")
for right, x in enumerate(nums):
    total += x
    while total >= target:             # shrink while it still qualifies
        best = min(best, right - left + 1)
        total -= nums[left]
        left += 1
print(best if best != float("inf") else 0)   # 2
```

### Letter counts in a window: find all anagrams

```python
from collections import Counter

s, p = "cbaebabacd", "abc"
need = Counter(p)
window = Counter(s[:len(p)])
starts = [0] if window == need else []
for right in range(len(p), len(s)):
    window[s[right]] += 1              # the new letter comes in
    window[s[right - len(p)]] -= 1     # the oldest letter leaves
    if window == need:                 # a count of 0 counts as missing
        starts.append(right - len(p) + 1)
print(starts)                          # [0, 6]
```

A list of 26 counts works the same way: `counts[ord(ch) - ord("a")] += 1`, and `==` compares two lists.

### Prefix sums

`prefix[i]` is the sum of the first `i` items, so the sum of `nums[i..j]` is `prefix[j + 1] - prefix[i]`.

```python
from itertools import accumulate

nums = [3, 1, 4, 1, 5]
prefix = [0] + list(accumulate(nums))
print(prefix)                          # [0, 3, 4, 8, 9, 14]
i, j = 1, 3
print(prefix[j + 1] - prefix[i])       # 6  1 + 4 + 1
print(list(accumulate(nums, initial=0)))   # [0, 3, 4, 8, 9, 14]  the same list
print(list(accumulate(nums, max)))     # [3, 3, 4, 4, 5]  a running max
```

### Prefix sums with a dict: subarrays that sum to k

A subarray ending here sums to `k` when an earlier prefix equals `total - k`. Count the prefixes seen so far, starting with the empty one.

```python
from collections import defaultdict

def subarray_sum(nums, k):
    seen = defaultdict(int)
    seen[0] = 1                        # the empty prefix
    total = count = 0
    for x in nums:
        total += x
        count += seen[total - k]
        seen[total] += 1
    return count

print(subarray_sum([1, 1, 1], 2), subarray_sum([1, 2, 3], 3), subarray_sum([1, -1, 0], 0))   # 2 2 3
```

### Prefix and suffix products

Product of the array except self, with no division: one pass leaves the product of everything to the left, a second pass from the right multiplies in everything to the right.

```python
nums = [1, 2, 3, 4]
out = [1] * len(nums)
before = 1
for i in range(len(nums)):
    out[i] = before                    # the product of everything to the left
    before *= nums[i]
after = 1
for i in range(len(nums) - 1, -1, -1):
    out[i] *= after                    # times everything to the right
    after *= nums[i]
print(out)                             # [24, 12, 8, 6]
```

### Which pattern

| The problem says | Reach for |
| --- | --- |
| sorted, find a pair | one pointer at each end, moving inward |
| in place, keep the order | a write index behind a read index |
| exactly k in a row | a fixed window, add one and drop one |
| longest or shortest run that follows a rule | a variable window, `while` to shrink |
| many range sums | prefix sums |
| count subarrays with a sum, negatives allowed | prefix sums and a dict of counts |

### Gotchas

- A window that shrinks in a `while` is still O(n): each index enters once and leaves once.
- A shrinking sum window needs non-negative numbers. With negatives, use prefix sums and a dict.
- Start the dict with `seen[0] = 1`, or subarrays that begin at index 0 are missed.
- `range(len(s) - 1, -1, -1)` walks backwards to index 0. `range(len(s) - 1, 0, -1)` stops before it.
