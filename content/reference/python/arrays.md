# Lists

Python's list is a dynamic array: it grows as you append, holds any mix of types, and indexes from 0. There is no fixed-size array in the core language, so a list is what you reach for. No import needed.

### Create

```python
nums = [3, 1, 4]
empty = []
zeros = [0] * 5                      # [0, 0, 0, 0, 0]
digits = list(range(5))              # [0, 1, 2, 3, 4]
chars = list("abc")                  # ['a', 'b', 'c']
squares = [i * i for i in range(4)]  # [0, 1, 4, 9]
mixed = [1, "two", 3.0, None]
n = len(nums)                        # 3
```

### Access and slice

```python
xs = [10, 20, 30, 40, 50]
xs[0]           # 10
xs[-1]          # 50  last
xs[-2]          # 40
xs[1:3]         # [20, 30]  start to stop (excluded)
xs[:2]          # [10, 20]
xs[2:]          # [30, 40, 50]
xs[::2]         # [10, 30, 50]  every 2nd
xs[::-1]        # [50, 40, 30, 20, 10]
xs[1] = 99      # replace in place
xs[1:3] = [7]   # replace a slice: [10, 7, 40, 50]
```

### Add and remove

```python
xs = [1, 2]
xs.append(3)        # add to the end: [1, 2, 3]
xs.extend([4, 5])   # add many: [1, 2, 3, 4, 5]
xs.insert(0, 0)     # at an index: [0, 1, 2, 3, 4, 5]
xs.pop()            # 5  removes and returns the last
xs.pop(0)           # 0  removes and returns at an index
xs.remove(3)        # removes the first 3 (ValueError if missing)
del xs[0]           # delete by index
xs                  # [2, 4]
xs.clear()          # []
```

### Search and count

```python
xs = [5, 3, 5, 1]
3 in xs             # True
7 not in xs         # True
xs.index(5)         # 0  first match (ValueError if missing)
xs.count(5)         # 2
min(xs), max(xs), sum(xs)   # (1, 5, 14)
```

### Sort and reverse

```python
xs = [3, 1, 2]
xs.sort()                       # in place, returns None
xs                              # [1, 2, 3]
xs.sort(reverse=True)           # [3, 2, 1]
ys = sorted([3, 1, 2])          # new list: [1, 2, 3]

words = ["kiwi", "fig", "banana"]
sorted(words, key=len)          # ['fig', 'kiwi', 'banana']
sorted(words, key=len, reverse=True)  # ['banana', 'kiwi', 'fig']
words.reverse()                 # in place: ['banana', 'fig', 'kiwi']
```

### Copy, combine, convert

```python
a = [1, 2]
same = a                # NOT a copy, both names point at one list
b = a.copy()            # or a[:] or list(a)
c = a + [3]             # [1, 2, 3]
d = a * 2               # [1, 2, 1, 2]
" ".join(map(str, a))   # '1 2'
list(map(int, "4 5 6".split()))   # [4, 5, 6]
```

### Use it in a loop

```python
prices = [4.5, 2.0, 7.25]
total = 0
for p in prices:
    total += p
print(total)            # 13.75

cheap = []
for p in prices:
    if p < 5:
        cheap.append(p)
print(cheap)            # [4.5, 2.0]
```

### Fixed-size options

```python
from array import array

point = (3, 4)                  # tuple: fixed length, can't change
ints = array("i", [1, 2, 3])    # typed numbers only, still growable
ints.append(4)
ints[0]                         # 1
```

| Call | Does |
| --- | --- |
| `xs.append(x)` | add one item to the end |
| `xs.extend(ys)` | add every item of `ys` |
| `xs.insert(i, x)` | add at index `i` |
| `xs.pop()` / `xs.pop(i)` | remove and return last / at `i` |
| `xs.remove(x)` | remove first `x` |
| `xs.index(x)` | index of first `x` |
| `xs.count(x)` | how many times `x` appears |
| `xs.sort(key=..., reverse=...)` | sort in place |
| `sorted(xs)` | new sorted list |
| `xs.reverse()` | reverse in place |
| `xs.copy()` | shallow copy |
| `len(xs)` | number of items |

### Gotchas

- `b = a` does not copy. Changing `b` changes `a`. Use `a.copy()`.
- `xs = xs.sort()` sets `xs` to `None`. `sort()` works in place, `sorted()` returns a new list.
- `xs[10]` raises `IndexError`, but slices never do: `xs[10:]` is just `[]`.
- `[[0] * 3] * 3` makes three references to one row. See 2D Lists.
