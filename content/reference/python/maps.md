# Dictionaries

Python's map is the built-in `dict`: a hash table from keys to values. Keys must be hashable (`str`, `int`, `tuple`, not `list`), and a dict remembers insertion order.

### Create

```python
ages = {"ana": 31, "bo": 25}
empty = {}                              # {} is a dict, not a set
print(dict(a=1, b=2))                   # {'a': 1, 'b': 2}
print(dict(zip(["x", "y"], [1, 2])))    # {'x': 1, 'y': 2}
print(dict.fromkeys(["a", "b"], 0))     # {'a': 0, 'b': 0}
print({n: n * n for n in range(4)})     # {0: 0, 1: 1, 2: 4, 3: 9}
```

### Access

```python
ages = {"ana": 31, "bo": 25}
print(ages["ana"])            # 31
print(ages.get("cy"))         # None
print(ages.get("cy", 0))      # 0
print("bo" in ages)           # True
print(len(ages))              # 2
```

`ages["cy"]` raises `KeyError` when the key is missing. Use `get` or `in` when it might be.

### Add, update, remove

```python
ages = {"ana": 31, "bo": 25}
ages["cy"] = 40               # add or overwrite
ages["ana"] += 1              # update in place
ages.update({"bo": 26, "di": 19})
del ages["di"]                # KeyError if missing
print(ages.pop("cy"))         # 40  remove and return
ages.pop("zz", None)          # no error if missing
print(ages)                   # {'ana': 32, 'bo': 26}
merged = ages | {"ed": 50}    # new dict, right side wins
print(merged)                 # {'ana': 32, 'bo': 26, 'ed': 50}
```

### Loop

```python
prices = {"apple": 1.25, "pear": 0.5}
for name in prices:                   # keys
    print(name)
for name, price in prices.items():    # key and value
    print(f"{name}: ${price:.2f}")    # apple: $1.25
for price in prices.values():
    print(price)
```

### Count and group

```python
from collections import Counter, defaultdict

words = ["a", "b", "a", "c", "a"]
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(counts)                         # {'a': 3, 'b': 1, 'c': 1}

print(Counter(words).most_common(1))  # [('a', 3)]

by_len = defaultdict(list)            # missing keys start as []
for w in ["hi", "yo", "hey"]:
    by_len[len(w)].append(w)
print(dict(by_len))                   # {2: ['hi', 'yo'], 3: ['hey']}

groups = {}
for w in ["hi", "yo", "hey"]:
    groups.setdefault(w[0], []).append(w)   # insert [] the first time
print(groups)                         # {'h': ['hi', 'hey'], 'y': ['yo']}
```

### Counter

```python
from collections import Counter

c = Counter("banana")
print(c["a"], c["z"])                 # 3 0  a missing key counts 0
print(c.most_common(2))               # [('a', 3), ('n', 2)]
c.update("an")                        # add more counts
print(c["a"], c["n"])                 # 4 3
c["b"] -= 1
print(+c)                             # Counter({'a': 4, 'n': 3})  + drops counts of 0 or less
print(Counter("listen") == Counter("silent"))   # True  same letters, same counts
print(sorted(Counter("cabbac").items()))        # [('a', 2), ('b', 2), ('c', 2)]
```

### Interview patterns

```python
from collections import defaultdict

nums, target = [2, 7, 11, 15], 9
index_of = {}                         # value -> index, filled in one pass
for i, x in enumerate(nums):
    if target - x in index_of:
        print(index_of[target - x], i)   # 0 1
        break
    index_of[x] = i

groups = defaultdict(list)            # sorted letters -> the words with them
for w in ["eat", "tea", "tan", "ate", "nat", "bat"]:
    groups["".join(sorted(w))].append(w)
print(sorted(sorted(g) for g in groups.values()))   # [['ate', 'eat', 'tea'], ['bat'], ['nat', 'tan']]

seen = {}
seen[(2, 3)] = "visited"              # a tuple key: a grid cell, a pair
print(seen.get((2, 3)), seen.get((0, 0), "new"))   # visited new
```

### Sort

```python
scores = {"ana": 90, "bo": 72, "cy": 85}
print(sorted(scores))                                 # ['ana', 'bo', 'cy']
print(max(scores, key=scores.get))                    # ana
by_score = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
print(by_score)               # [('ana', 90), ('cy', 85), ('bo', 72)]
print(dict(by_score))         # {'ana': 90, 'cy': 85, 'bo': 72}
```

### Methods

| Call | Does |
| --- | --- |
| `d.get(k, default)` | value, or default (None) if missing |
| `d.setdefault(k, v)` | value of k, inserting v first if missing |
| `d.keys()` / `d.values()` / `d.items()` | live views for looping |
| `d.update(other)` | merge in place, other wins |
| `d.pop(k, default)` | remove and return |
| `d.popitem()` | remove and return the last inserted pair |
| `d.copy()` | shallow copy |
| `d.clear()` | remove everything |

### Gotchas

- Changing a dict's size while looping over it raises `RuntimeError`. Loop over `list(d)` if you delete keys.
- `dict.fromkeys(keys, [])` shares one list across every key. Use `{k: [] for k in keys}` instead.
- `d.copy()` is shallow: nested lists and dicts are still shared.
- `{}` is an empty dict. An empty set is `set()`.
