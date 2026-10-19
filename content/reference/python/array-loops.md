# Looping Over Lists

Use `for x in xs` when you only need the values, `enumerate` when you also need the index, and a `while` with an index when you control the steps yourself.

### for: each value

```python
nums = [4, 8, 15]
for n in nums:
    print(n)                # 4, 8, 15
```

### for: index and value

```python harness
nums = [4, 8, 15]
{{code}}
```

```python
for i, n in enumerate(nums):
    print(i, n)             # 0 4, 1 8, 2 15

for i in range(len(nums)):  # index only, read with nums[i]
    print(i, nums[i])       # 0 4, 1 8, 2 15
```

### while: index by hand

```python harness
nums = [4, 8, 15]
{{code}}
```

```python
i = 0
while i < len(nums):
    print(nums[i])          # 4, 8, 15
    i += 1
```

### Change items in place

```python
xs = [1, 2, 3]
for i in range(len(xs)):
    xs[i] *= 2
print(xs)                   # [2, 4, 6]

for x in xs:
    x *= 10                 # only changes the local name x
print(xs)                   # [2, 4, 6]  unchanged
```

### Accumulate: sum, max, count

```python
nums = [7, 2, 9, 4]
total = 0
best = nums[0]
evens = 0
for n in nums:
    total += n
    if n > best:
        best = n
    if n % 2 == 0:
        evens += 1
print(total, best, evens)   # 22 9 2
```

The built-ins do the same in one call: `sum(nums)`, `max(nums)`, `sum(1 for n in nums if n % 2 == 0)`.

### Build a new list

```python
nums = [7, 2, 9, 4]
doubled = []
for n in nums:
    doubled.append(n * 2)
print(doubled)              # [14, 4, 18, 8]

doubled = [n * 2 for n in nums]           # same, as a comprehension
print([n for n in nums if n > 5])         # [7, 9]
```

### Search: stop at the first match

```python
names = ["ana", "bo", "cy"]
for i, name in enumerate(names):
    if name == "bo":
        print("found at", i)    # found at 1
        break
else:
    print("not found")          # only if the loop never broke

print(names.index("bo") if "bo" in names else -1)     # 1
print(next((n for n in names if len(n) == 2), None))  # bo
```

### Remove items while looping

```python
xs = [1, 2, 3, 4, 5, 6]
xs = [x for x in xs if x % 2 == 1]   # keep odds
print(xs)                            # [1, 3, 5]

ys = [1, 2, 3, 4, 5, 6]
for i in range(len(ys) - 1, -1, -1):  # backwards, so indexes don't shift
    if ys[i] % 2 == 0:
        del ys[i]
print(ys)                             # [1, 3, 5]
```

| Loop | Use when |
| --- | --- |
| `for x in xs` | you only need the values |
| `for i, x in enumerate(xs)` | you need the index too |
| `for i in range(len(xs))` | you assign `xs[i] = ...` |
| `while i < len(xs)` | you move `i` by different amounts |
| `for a, b in zip(xs, ys)` | two lists in step |
| `[f(x) for x in xs if ...]` | build a new list |

### Gotchas

- `for x in xs: x = 0` does not change the list. Assign through the index: `xs[i] = 0`.
- Removing from a list while a `for` walks it forward skips the item after each removal. Build a new list or loop backwards.
- `range(len(xs))` already stops at the last index. `range(len(xs) + 1)` goes one past and raises `IndexError`.
