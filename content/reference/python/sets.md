# Sets

A `set` is an unordered collection of unique, hashable values with O(1) average `in`, `add`, and `remove`. Use it to dedupe and to ask "have I seen this?". `frozenset` is the immutable version.

### Create

```python
seen = set()                  # empty set ({} would be a dict)
colors = {"red", "green", "red"}
print(len(colors))            # 2
letters = set("hello")
print(sorted(letters))        # ['e', 'h', 'l', 'o']
evens = {n for n in range(10) if n % 2 == 0}
frozen = frozenset([1, 2, 3])  # immutable, can be a dict key
```

### Add, remove, check

```python
s = {1, 2}
s.add(3)
print(s)                      # {1, 2, 3}
s.update([4, 5])              # add many
s.remove(5)                   # KeyError if missing
s.discard(99)                 # no error if missing
x = s.pop()                   # removes an arbitrary element
print(2 in s, 99 not in s)    # True True
```

### Set math

```python
a = {1, 2, 3, 4}
b = {3, 4, 5}
print(a | b)                  # {1, 2, 3, 4, 5}
print(a & b)                  # {3, 4}
print(a - b)                  # {1, 2}
print(a ^ b)                  # {1, 2, 5}
print({1, 2} <= a)            # True
print(a.isdisjoint({9}))      # True
```

| Operator | Method | Does |
| --- | --- | --- |
| `a & b` | `a.intersection(b)` | in both |
| `a - b` | `a.difference(b)` | in a, not b |
| `a ^ b` | `a.symmetric_difference(b)` | in exactly one |
| `a <= b` | `a.issubset(b)` | every item of a is in b |
| `a >= b` | `a.issuperset(b)` | every item of b is in a |

Union is `a.union(b)` or the pipe operator shown above. `a.update(b)` adds all of b into a in place. The methods accept any iterable (`a.union([7, 8])`), but the operators need two sets.

### Loop

```python
tags = {"py", "go", "js"}
for tag in sorted(tags):      # sets have no order, sort for stable output
    print(tag)                # go, js, py
```

### Dedupe and seen-before

```python
nums = [3, 1, 3, 2, 1]
print(sorted(set(nums)))              # [1, 2, 3]
print(list(dict.fromkeys(nums)))      # [3, 1, 2]  keeps first-seen order

seen = set()
for n in nums:
    if n in seen:
        print("first repeat:", n)     # first repeat: 3
        break
    seen.add(n)

words = "the cat and the hat".split()
print(len(set(words)))                # 4
print(len(set(nums)) != len(nums))    # True  the list has a duplicate
```

### Tuples in a set, frozenset as a key

```python
visited = set()
visited.add((0, 1))                   # a grid cell as (row, col)
print((0, 1) in visited, (1, 0) in visited)   # True False

pair_count = {frozenset({"a", "b"}): 3}       # an unordered pair as a dict key
print(pair_count[frozenset({"b", "a"})])      # 3  order doesn't matter
seen_groups = {frozenset("tea")}
print(frozenset("eat") in seen_groups)        # True
```

### Runs of consecutive numbers

Start counting only at a number whose predecessor is missing, so each run is walked once and the whole pass is O(n).

```python
nums = [100, 4, 200, 1, 3, 2]
have = set(nums)
best = 0
for x in have:
    if x - 1 not in have:             # x starts a run
        length = 1
        while x + length in have:
            length += 1
        best = max(best, length)
print(best)                           # 4  the run 1, 2, 3, 4
```

### Gotchas

- `{}` is an empty dict. Write `set()` for an empty set.
- Sets are unordered. Printing one or looping over it can come out in any order, so sort when order matters.
- Elements must be hashable: `{[1, 2]}` is a `TypeError`. Use a tuple or `frozenset` instead.
- `set("hello")` splits into characters. For one string, write `{"hello"}`.
