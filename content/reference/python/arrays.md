# Lists

Python's list is a dynamic array: it grows as you append, holds any mix of types, and indexes from 0. There is no fixed-size array in the core language, so a list is what you reach for. No import needed.

### Create

```python
nums = [3, 1, 4]
empty = []
print([0] * 5)                       # [0, 0, 0, 0, 0]
print(list(range(5)))                # [0, 1, 2, 3, 4]
print(list("abc"))                   # ['a', 'b', 'c']
print([i * i for i in range(4)])     # [0, 1, 4, 9]
mixed = [1, "two", 3.0, None]
print(len(nums))                     # 3
```

### Access and slice

```python
xs = [10, 20, 30, 40, 50]
print(xs[0])      # 10
print(xs[-1])     # 50  last
print(xs[-2])     # 40
print(xs[1:3])    # [20, 30]  start to stop (excluded)
print(xs[:2])     # [10, 20]
print(xs[2:])     # [30, 40, 50]
print(xs[::2])    # [10, 30, 50]  every 2nd
print(xs[::-1])   # [50, 40, 30, 20, 10]
xs[1] = 99        # replace in place
xs[1:3] = [7]     # replace a slice
print(xs)         # [10, 7, 40, 50]
```

### Add and remove

```python
xs = [1, 2]
xs.append(3)        # add to the end
xs.extend([4, 5])   # add many
xs.insert(0, 0)     # at an index
print(xs)           # [0, 1, 2, 3, 4, 5]
print(xs.pop())     # 5  removes and returns the last
print(xs.pop(0))    # 0  removes and returns at an index
xs.remove(3)        # removes the first 3 (ValueError if missing)
del xs[0]           # delete by index
print(xs)           # [2, 4]
xs.clear()
print(xs)           # []
```

### Search and count

```python
xs = [5, 3, 5, 1]
print(3 in xs)      # True
print(7 not in xs)  # True
print(xs.index(5))  # 0  first match (ValueError if missing)
print(xs.count(5))  # 2
print(min(xs), max(xs), sum(xs))   # 1 5 14
```

### Sort and reverse

```python
xs = [3, 1, 2]
xs.sort()                       # in place, returns None
print(xs)                       # [1, 2, 3]
xs.sort(reverse=True)
print(xs)                       # [3, 2, 1]
print(sorted([3, 1, 2]))        # [1, 2, 3]  new list

words = ["kiwi", "fig", "banana"]
print(sorted(words, key=len))   # ['fig', 'kiwi', 'banana']
print(sorted(words, key=len, reverse=True))  # ['banana', 'kiwi', 'fig']
words.reverse()                 # in place
print(words)                    # ['banana', 'fig', 'kiwi']
```

### Copy, combine, convert

```python
a = [1, 2]
same = a                       # NOT a copy, both names point at one list
b = a.copy()                   # or a[:] or list(a)
print(a + [3])                 # [1, 2, 3]
print(a * 2)                   # [1, 2, 1, 2]
print(" ".join(map(str, a)))   # 1 2
print(list(map(int, "4 5 6".split())))   # [4, 5, 6]
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
print(ints[0])                  # 1
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
