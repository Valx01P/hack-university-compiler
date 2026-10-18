# Multiple Assignment

Python assigns several names in one statement by unpacking: the right side is built first, then its items go to the names on the left, in order. That makes a swap one line.

### Several at once

```python
a, b, c = 1, 2, 3
x = y = z = 0           # chained: all three names get 0
name, age = "Ada", 36
```

### Swap

```python
a, b = 1, 2
a, b = b, a
print(a, b)             # 2 1
```

### Unpack any sequence

```python
point = (3, 4)
x, y = point            # x = 3, y = 4
q, r = divmod(17, 5)    # q = 3, r = 2
first, second = "hi"    # first = 'h', second = 'i'
k, v = ["key", "value"]
(a, b), c = (1, 2), 3   # nested: a = 1, b = 2, c = 3
```

### Star grabs the rest

```python
first, *rest = [1, 2, 3, 4]     # first = 1, rest = [2, 3, 4]
*init, last = [1, 2, 3, 4]      # init = [1, 2, 3], last = 4
head, *_, tail = "python"       # head = 'p', tail = 'n'
only, *empty = [7]              # only = 7, empty = []
```

### Ignore a value

```python
_, y = (10, 20)                 # _ means "don't care"
name, _, city = ("Ada", 36, "London")
```

### Use it in a loop

```python
pairs = [("ada", 36), ("alan", 41)]
for name, age in pairs:
    print(name, age)            # ada 36, alan 41

for i, ch in enumerate("ab"):
    print(i, ch)                # 0 a, 1 b

a, b = 0, 1
for _ in range(7):
    print(a, end=" ")           # 0 1 1 2 3 5 8
    a, b = b, a + b             # uses the old a and b
print()
```

### Assign inside an expression

The walrus operator `:=` assigns and returns the value in one step.

```python
data = [5, 8, 2]
if (n := len(data)) > 2:
    print(f"{n} items")         # 3 items
```

### One statement on several lines

```python
total = (1 +
         2 +
         3)                     # open brackets continue the line
point = {
    "x": 1,
    "y": 2,
}
```

### Gotchas

- The counts must match: `a, b = [1, 2, 3]` raises `ValueError: too many values to unpack`. Use `*rest` to absorb extras.
- `a = b = []` gives both names the same list. Append through one and both see it. Write `a, b = [], []` for two lists.
- `x, y = 5` raises `TypeError` because an int can't be unpacked.
