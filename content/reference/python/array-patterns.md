# List Loop Patterns

Most patterns are a `range` with the right start, stop, and step, or a slice `xs[start:stop:step]`. Slices make a new list, ranges just produce indexes.

```python
xs = [10, 20, 30, 40, 50, 60]
print(len(xs))                      # 6
```

### Reverse

```python harness
xs = [10, 20, 30, 40, 50, 60]
{{code}}
```

```python
for x in reversed(xs):
    print(x)                        # 60, 50, ..., 10

for i in range(len(xs) - 1, -1, -1):
    print(i, xs[i])                 # 5 60, 4 50, ..., 0 10

print(xs[::-1])                     # [60, 50, 40, 30, 20, 10]
```

### Every other, skip odd, every k-th

```python harness
xs = [10, 20, 30, 40, 50, 60]
{{code}}
```

```python
print(xs[::2])                          # [10, 30, 50]  even indexes
print(xs[1::2])                         # [20, 40, 60]  odd indexes
print(xs[::3])                          # [10, 40]

for i in range(0, len(xs), 2):          # even indexes only
    print(i, xs[i])                     # 0 10, 2 30, 4 50

nums = [1, 2, 3, 4, 5, 6]
print([n for n in nums if n % 2 == 0])  # [2, 4, 6]  even values, skip odd ones
```

### First n, last n, skip the ends

```python harness
xs = [10, 20, 30, 40, 50, 60]
{{code}}
```

```python
print(xs[:3])                       # [10, 20, 30]
print(xs[-2:])                      # [50, 60]
print(xs[1:-1])                     # [20, 30, 40, 50]
for x in xs[1:]:                    # skip the first
    print(x)                        # 20, 30, 40, 50, 60
```

### Neighbors: compare each item with the next

```python
from itertools import pairwise

temps = [3, 5, 4, 8]
for i in range(1, len(temps)):
    if temps[i] > temps[i - 1]:
        print("up at", i)           # up at 1, up at 3

for a, b in zip(temps, temps[1:]):
    print(b - a)                    # 2, -1, 4

print(list(pairwise(temps)))        # [(3, 5), (5, 4), (4, 8)]
```

### Chunks and sliding windows

```python harness
xs = [10, 20, 30, 40, 50, 60]
{{code}}
```

```python
from itertools import batched

for i in range(0, len(xs), 4):
    print(xs[i:i + 4])              # [10, 20, 30, 40], [50, 60]

print(list(batched(xs, 4)))         # [(10, 20, 30, 40), (50, 60)]

k = 3
for i in range(len(xs) - k + 1):
    print(sum(xs[i:i + k]))         # 60, 90, 120, 150
```

### From both ends toward the middle

```python
ys = [1, 2, 3, 4, 5]
i, j = 0, len(ys) - 1
while i < j:                        # reverse in place
    ys[i], ys[j] = ys[j], ys[i]
    i += 1
    j -= 1
print(ys)                           # [5, 4, 3, 2, 1]
```

### Wrap around (circular)

```python
seats = ["a", "b", "c"]
for step in range(5):
    print(seats[step % len(seats)]) # a, b, c, a, b
```

### Every pair once

```python
from itertools import combinations

nums = [1, 2, 3]
for i in range(len(nums)):
    for j in range(i + 1, len(nums)):
        print(nums[i], nums[j])     # 1 2, 1 3, 2 3

print(list(combinations(nums, 2)))  # [(1, 2), (1, 3), (2, 3)]
```

### Running total (prefix sums)

```python
from itertools import accumulate

nums = [1, 2, 3, 4]
running = []
total = 0
for n in nums:
    total += n
    running.append(total)
print(running)                      # [1, 3, 6, 10]

print(list(accumulate(nums)))       # [1, 3, 6, 10]
```

| Want | Write |
| --- | --- |
| backwards | `reversed(xs)` or `range(len(xs) - 1, -1, -1)` |
| even indexes | `xs[::2]` or `range(0, len(xs), 2)` |
| odd indexes | `xs[1::2]` or `range(1, len(xs), 2)` |
| each item and the next | `zip(xs, xs[1:])` or `pairwise(xs)` |
| groups of k | `range(0, len(xs), k)` with `xs[i:i + k]` |
| window of k | `range(len(xs) - k + 1)` |
| wrap around | `xs[i % len(xs)]` |

### Gotchas

- Counting down needs stop `-1`, not `0`: `range(len(xs) - 1, 0, -1)` never reaches index 0.
- `reversed(xs)` returns an iterator, not a list. Wrap it in `list(...)` to print or index it.
- `xs[::-1]` and every slice copy the list. Fine for small lists, but a slice inside a big loop costs time.
- `itertools.batched` is new in 3.12 and `pairwise` in 3.10. Both work here.
