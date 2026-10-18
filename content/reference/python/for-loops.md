# For Loops

Python's `for` walks over the items of anything iterable: a list, a string, a `range`, a dict. There is no C-style `for (i = 0; i < n; i++)`, you loop over `range(n)` instead.

### Count with range

```python
for i in range(3):
    print(i)                # 0, 1, 2

for _ in range(3):          # _ means "I don't use the variable"
    print("hi")             # hi, hi, hi

list(range(5))              # [0, 1, 2, 3, 4]
list(range(2, 6))           # [2, 3, 4, 5]  start, stop (stop is excluded)
list(range(0, 10, 3))       # [0, 3, 6, 9]  step
list(range(5, 0, -1))       # [5, 4, 3, 2, 1]  count down
list(range(1, 11, 2))       # [1, 3, 5, 7, 9]
list(range(0))              # []  the body never runs
```

### Loop over items

```python
names = ["ana", "bo", "cy"]
for name in names:
    print(name)                            # ana, bo, cy

for i, name in enumerate(names):           # index and value
    print(i, name)                         # 0 ana, 1 bo, 2 cy

for n, name in enumerate(names, start=1):  # count from 1
    print(f"{n}. {name}")                  # 1. ana, 2. bo, 3. cy

ages = [31, 25, 40]
for name, age in zip(names, ages):         # two lists side by side
    print(name, age)                       # ana 31, bo 25, cy 40
```

### Strings, dicts, reversed, sorted

```python
for ch in "hey":
    print(ch)                   # h, e, y

scores = {"ana": 90, "bo": 72}
for key in scores:              # keys
    print(key)                  # ana, bo
for key, value in scores.items():
    print(key, value)           # ana 90, bo 72

for x in reversed([1, 2, 3]):
    print(x)                    # 3, 2, 1
for x in sorted([3, 1, 2]):
    print(x)                    # 1, 2, 3
```

### break, continue, else

```python
for n in [3, 8, 5, 12, 6]:
    if n % 2 == 1:
        continue        # skip the rest of this pass
    if n > 10:
        break           # leave the loop now
    print(n)            # 8

for n in [1, 3, 5]:
    if n % 2 == 0:
        print("found an even")
        break
else:
    print("no even")    # no even  (else runs only when the loop did not break)
```

### Nested loops

```python
for row in range(1, 4):
    for col in range(1, 4):
        print(row * col, end=" ")
    print()
```

```text
1 2 3
2 4 6
3 6 9
```

`break` only leaves the innermost loop. To stop both, put the loops in a function and `return`.

```python
def find(grid, target):
    for r, row in enumerate(grid):
        for c, value in enumerate(row):
            if value == target:
                return r, c
    return None

find([[1, 2], [3, 4]], 3)       # (1, 0)
```

### One-line loops (comprehensions)

```python
squares = [i * i for i in range(5)]           # [0, 1, 4, 9, 16]
evens = [n for n in range(10) if n % 2 == 0]  # [0, 2, 4, 6, 8]
total = sum(i for i in range(101))            # 5050
pairs = [(a, b) for a in "ab" for b in "xy"]  # [('a', 'x'), ('a', 'y'), ('b', 'x'), ('b', 'y')]
```

| Call | Does |
| --- | --- |
| `range(stop)` | 0 up to stop - 1 |
| `range(start, stop, step)` | start up to stop (excluded), by step, step can be negative |
| `enumerate(xs, start=0)` | yields `(index, value)` pairs |
| `zip(a, b)` | yields `(a[i], b[i])` pairs, stops at the shortest |
| `reversed(xs)` | items back to front |
| `sorted(xs)` | a new sorted list to loop over |
| `d.items()` | `(key, value)` pairs of a dict |

### Gotchas

- `range(1, 10)` stops at 9. The stop value is never included.
- Changing the loop variable does not skip passes: `i += 2` inside `for i in range(5)` still runs 5 times. Use `while` when you need to jump.
- Adding or removing items from a list while you loop over it skips items. Loop over a copy (`for x in xs[:]`) or build a new list.
- `zip` silently stops at the shortest list. Pass `strict=True` to get a `ValueError` instead.
