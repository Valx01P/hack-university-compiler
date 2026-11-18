# Sorting and Comparators

`xs.sort()` sorts a list in place and returns `None`. `sorted(xs)` returns a new list from anything you can loop over. Both take `key=`, a function that turns each item into what gets compared, and `reverse=True`. Both are stable: items with equal keys keep their earlier order.

### Ascending and descending

```python
nums = [5, 2, 9, 1]
nums.sort()
print(nums)                          # [1, 2, 5, 9]
nums.sort(reverse=True)
print(nums)                          # [9, 5, 2, 1]
print(sorted([3, 1, 2]))             # [1, 2, 3]  a new list
print(sorted("listen"))              # ['e', 'i', 'l', 'n', 's', 't']
print("".join(sorted("listen")))     # eilnst  a key for anagrams
print(sorted((3, 1, 2)))             # [1, 2, 3]  always a list back
```

### By a key

```python
words = ["pear", "Fig", "apple", "kiwi"]
print(sorted(words))                         # ['Fig', 'apple', 'kiwi', 'pear']  uppercase first
print(sorted(words, key=str.lower))          # ['apple', 'Fig', 'kiwi', 'pear']
print(sorted(words, key=len))                # ['Fig', 'pear', 'kiwi', 'apple']  ties keep order
print(sorted(words, key=len, reverse=True))  # ['apple', 'pear', 'kiwi', 'Fig']
print(sorted([-3, 1, -2], key=abs))          # [1, -2, -3]
print(max(words, key=len))                   # apple
```

### Two keys: return a tuple

Tuples compare item by item, so a tuple key sorts by its first item, then by the next on a tie. For mixed directions, negate the number that goes high to low.

```python
people = [("cy", 30), ("ana", 25), ("bo", 30)]
by_age = sorted(people, key=lambda p: (p[1], p[0]))
print(by_age)        # [('ana', 25), ('bo', 30), ('cy', 30)]
oldest = sorted(people, key=lambda p: (-p[1], p[0]))
print(oldest)        # [('bo', 30), ('cy', 30), ('ana', 25)]  age down, name up
```

A string can't be negated. To sort a string high to low inside a tie, sort twice: the tie-breaker first, then the main key. Stability keeps the first order inside each tie.

```python
rows = [("ana", 3), ("cy", 1), ("bo", 3)]
rows.sort(key=lambda r: r[0], reverse=True)   # tie-breaker: name, Z to A
rows.sort(key=lambda r: r[1])                 # main key: count, low to high
print(rows)          # [('cy', 1), ('bo', 3), ('ana', 3)]
```

### A list of lists by a column (intervals)

Lists compare item by item too, so a plain `sort()` on intervals sorts by start, then by end.

```python
from operator import itemgetter

intervals = [[8, 10], [1, 3], [2, 6], [15, 18]]
intervals.sort()
print(intervals)                         # [[1, 3], [2, 6], [8, 10], [15, 18]]
by_end = sorted([[1, 9], [2, 3], [4, 5]], key=lambda iv: iv[1])
print(by_end)                            # [[2, 3], [4, 5], [1, 9]]
print(sorted([[1, 9], [2, 3]], key=itemgetter(1)))   # [[2, 3], [1, 9]]  same as lambda iv: iv[1]
```

Meeting rooms: sort by start, then a meeting that starts before the previous one ends is a clash.

```python
meetings = [[9, 10], [1, 3], [4, 8], [2, 6]]
meetings.sort(key=lambda m: m[0])
clash = any(b[0] < a[1] for a, b in zip(meetings, meetings[1:]))
print(clash)                             # True  [2, 6] starts before [1, 3] ends
```

### Merge intervals

```python
intervals = [[8, 10], [1, 3], [2, 6], [15, 18]]
intervals.sort()
merged = []
for start, end in intervals:
    if merged and start <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], end)   # overlap: stretch the last one
    else:
        merged.append([start, end])               # no overlap: start a new one
print(merged)                                     # [[1, 6], [8, 10], [15, 18]]
```

### A dict's items by value

```python
counts = {"the": 3, "a": 5, "cat": 3, "on": 1}
by_count = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
print(by_count)     # [('a', 5), ('the', 3), ('cat', 3), ('on', 1)]
ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
print(ranked)       # [('a', 5), ('cat', 3), ('the', 3), ('on', 1)]  count down, word up
print(sorted(counts, key=counts.get))     # ['on', 'the', 'cat', 'a']  just the keys
for word, n in ranked[:2]:
    print(word, n)  # a 5, then cat 3
```

`Counter.most_common()` orders ties by first appearance, not alphabetically. When ties must be alphabetical, sort the items with a tuple key as above.

### Objects

```python
from dataclasses import dataclass

@dataclass
class Player:
    name: str
    score: int

players = [Player("ana", 7), Player("bo", 9), Player("cy", 7)]
players.sort(key=lambda p: (-p.score, p.name))
print([p.name for p in players])      # ['bo', 'ana', 'cy']
```

### A custom comparator: cmp_to_key

When the order is a rule between two items instead of a key, write a function that returns a negative number (a first), 0, or a positive number (b first), and wrap it. Largest number: put `a` first when `a + b` beats `b + a`.

```python
from functools import cmp_to_key

def compare(a, b):
    if a + b > b + a:
        return -1
    if a + b < b + a:
        return 1
    return 0

strs = sorted(map(str, [3, 30, 34, 5, 9]), key=cmp_to_key(compare))
print(strs)                           # ['9', '5', '34', '3', '30']
print("".join(strs))                  # 9534330
zeros = "".join(sorted(["0", "0"], key=cmp_to_key(compare)))
print(zeros.lstrip("0") or "0")       # 0  not 00
print(sorted([5, 2, 8], key=cmp_to_key(lambda a, b: b - a)))   # [8, 5, 2]
```

### Stability

```python
orders = [("bo", "tea"), ("ana", "cake"), ("cy", "tea"), ("di", "cake")]
by_item = sorted(orders, key=lambda o: o[1])
print([name for name, _ in by_item])  # ['ana', 'di', 'bo', 'cy']  each group keeps its order
```

### Merge sort (divide and conquer)

```python
def merge_sort(xs):
    if len(xs) <= 1:
        return xs
    mid = len(xs) // 2
    left = merge_sort(xs[:mid])
    right = merge_sort(xs[mid:])
    merged = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:      # <= keeps it stable
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged

print(merge_sort([5, 2, 9, 1, 5, 6]))   # [1, 2, 5, 5, 6, 9]
```

### Sweep line: rooms in use at once

Sort the starts and the ends separately. Each start takes a room, and every meeting that ended by then gives one back.

```python
meetings = [[0, 30], [5, 10], [15, 20]]
starts = sorted(s for s, _ in meetings)
ends = sorted(e for _, e in meetings)
rooms = best = j = 0
for s in starts:
    while j < len(ends) and ends[j] <= s:
        rooms -= 1
        j += 1
    rooms += 1
    best = max(best, rooms)
print(best)          # 2
```

### Calls

| Call | Does |
| --- | --- |
| `xs.sort()` | sort the list in place, returns `None` |
| `sorted(xs)` | a new sorted list from any iterable |
| `key=len`, `key=str.lower` | compare what the function returns |
| `key=lambda x: (x[1], x[0])` | by one field, then another on a tie |
| `key=lambda x: (-x[1], x[0])` | a number high to low, then a field low to high |
| `reverse=True` | high to low, still stable |
| `operator.itemgetter(1)` | the same as `lambda x: x[1]` |
| `functools.cmp_to_key(f)` | turns a two-argument comparator into a key |

Sorting costs O(n log n), and Python's Timsort is close to O(n) on data that's already nearly sorted.

### Gotchas

- `xs = xs.sort()` sets `xs` to `None`. Use `xs.sort()` on its own line, or `xs = sorted(xs)`.
- Python 3 has no `cmp=` argument: `sorted(xs, cmp=f)` is a `TypeError`. Wrap the comparator with `cmp_to_key`.
- Mixed types don't compare: `sorted([3, "a"])` and `sorted([2, None])` raise `TypeError`.
- `sorted(d.items())` sorts by key. Pass `key=lambda kv: kv[1]` to sort by value.
