# Binary Search

The `bisect` module searches a sorted list in O(log n). `bisect_left` is the lower bound, the first index whose value is at least `x`, and `bisect_right` is the upper bound, the first index whose value is greater than `x`. For an exact match, a search over possible answers, or a rotated list, write the loop yourself.

### Lower and upper bound with bisect

```python
from bisect import bisect_left, bisect_right

nums = [1, 3, 3, 3, 7, 9]
print(bisect_left(nums, 3))      # 1  first index with nums[i] >= 3
print(bisect_right(nums, 3))     # 4  first index with nums[i] > 3
print(bisect_left(nums, 5))      # 4  where 5 would go
print(bisect_left(nums, 10))     # 6  len(nums), past the end
print(bisect_right(nums, 3) - bisect_left(nums, 3))   # 3  how many 3s
print(bisect_right(nums, 7) - bisect_left(nums, 2))   # 4  values from 2 to 7
```

### Is it there? First and last position

`bisect_left` returns a position even when the value is missing, so check the item there.

```python
from bisect import bisect_left, bisect_right

def first_last(nums, x):
    lo = bisect_left(nums, x)
    if lo == len(nums) or nums[lo] != x:
        return -1, -1
    return lo, bisect_right(nums, x) - 1

nums = [5, 7, 7, 8, 8, 10]
print(first_last(nums, 8))       # (3, 4)
print(first_last(nums, 6))       # (-1, -1)
print(bisect_left([1, 3, 5, 6], 2))   # 1  search insert position
```

### Insert and keep it sorted

```python
import bisect

scores = [10, 20, 30]
bisect.insort(scores, 25)        # after any equal items
print(scores)                    # [10, 20, 25, 30]
bisect.insort_left(scores, 20)   # before any equal items
print(scores)                    # [10, 20, 20, 25, 30]
```

### Search part of a list, or by a key

`lo` and `hi` limit the search to `xs[lo:hi]`. With `key=`, each item is compared as `key(item)`, but `x` is compared as it is, so pass `x` already in key form.

```python
from bisect import bisect_left, bisect_right

nums = [1, 2, 4, 4, 8]
print(bisect_left(nums, 4, 3))           # 3  search from index 3 on
history = [(1, "a"), (4, "b"), (9, "c")]   # (time, value), sorted by time
i = bisect_right(history, 5, key=lambda e: e[0])
print(history[i - 1] if i else None)     # (4, 'b')  the latest at or before time 5
```

### By hand: an exact match

```python
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1             # target is to the right
        else:
            hi = mid - 1             # target is to the left
    return -1

nums = [-1, 0, 3, 5, 9, 12]
print(binary_search(nums, 9), binary_search(nums, 2))   # 4 -1
```

### By hand: lower bound

`hi` starts at `len(nums)` because the answer can be past the end. The loop runs while `lo < hi` and keeps `mid` with `hi = mid`.

```python
def lower_bound(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:       # use <= here for the upper bound
            lo = mid + 1
        else:
            hi = mid
    return lo

nums = [1, 3, 5, 5, 6]
print(lower_bound(nums, 5), lower_bound(nums, 2), lower_bound(nums, 7))   # 2 1 5
```

### Binary search on the answer

When the answer is a number in a range, and "does `x` work?" turns from no to yes once as `x` grows, search the range for the first yes. Koko eating bananas: the slowest speed that finishes every pile within `h` hours.

```python
def hours_needed(piles, speed):
    return sum((p + speed - 1) // speed for p in piles)   # ceiling division

def min_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if hours_needed(piles, mid) <= h:
            hi = mid                 # mid works, try slower
        else:
            lo = mid + 1             # mid is too slow
    return lo

print(min_speed([3, 6, 7, 11], 8))          # 4
print(min_speed([30, 11, 23, 4, 20], 5))    # 30
```

`bisect` can do the same search over a `range`, with a key that says whether each candidate works (`False` sorts before `True`):

```python harness
def hours_needed(piles, speed):
    return sum((p + speed - 1) // speed for p in piles)

{{code}}
```

```python
from bisect import bisect_left

piles, h = [3, 6, 7, 11], 8
speeds = range(1, max(piles) + 1)
i = bisect_left(speeds, True, key=lambda s: hours_needed(piles, s) <= h)
print(speeds[i])                 # 4
```

Ceiling division without floats: `(a + b - 1) // b` or `-(-a // b)`. `math.ceil(a / b)` goes through a float and can be off for very large numbers.

```python
print((7 + 3 - 1) // 3, -(-7 // 3))   # 3 3
```

### Search a rotated sorted list

One half around `mid` is always sorted. Check whether the target falls inside that half, and keep the half that can hold it.

```python
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:                # left half is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                    # right half is sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1

nums = [4, 5, 6, 7, 0, 1, 2]
print(search_rotated(nums, 0), search_rotated(nums, 3))   # 4 -1
```

The smallest item of a rotated list is where the rotation starts:

```python
def find_min(nums):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1             # the drop is to the right of mid
        else:
            hi = mid
    return nums[lo]

print(find_min([4, 5, 6, 7, 0, 1, 2]))   # 0
```

### Calls

| Call | Does |
| --- | --- |
| `bisect_left(xs, x)` | first index with `xs[i] >= x`, the lower bound |
| `bisect_right(xs, x)` or `bisect(xs, x)` | first index with `xs[i] > x`, the upper bound |
| `bisect_left(xs, x, lo, hi)` | search only `xs[lo:hi]` |
| `bisect_left(xs, x, key=f)` | compare `f(item)` with `x` |
| `insort(xs, x)`, `insort_left(xs, x)` | insert in order, O(n) for the shift |
| `xs.index(x)` | a linear scan, O(n), `ValueError` if missing |

### Gotchas

- The list must already be sorted. `bisect` never checks, and on unsorted data it returns wrong positions without an error.
- Two loop shapes, don't mix them: `while lo <= hi` with `hi = mid - 1` for an exact match, and `while lo < hi` with `hi = mid` for a bound. Mixing them loops forever or skips the answer.
- Python ints never overflow, so `(lo + hi) // 2` is safe. Use `//`, since `/` gives a float that can't be an index.
- There's no sorted container in the standard library, and `insort` is O(n). For many inserts and lookups, a heap or a sort at the end is often enough.
