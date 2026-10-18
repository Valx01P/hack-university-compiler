# Infinity and Null

Python's null is `None`. Infinity is a float, written `float("inf")` or `math.inf`. There is no integer infinity, and ints never overflow, so there is no "max int" either.

### None

```python
result = None
if result is None:
    print("no result yet")      # no result yet

def greet():
    print("hi")

value = greet()                 # prints hi
print(value)                    # None  (no return means None)
```

### Defaults and fallbacks

```python
name = None
shown = name if name is not None else "guest"
print(shown)                    # guest

count = 0
print(count or 10)              # 10  (or replaces every falsy value, even 0)
print(count if count is not None else 10)   # 0

d = {"a": 1}
print(d.get("b"))               # None
print(d.get("b", 0))            # 0
```

### Optional parameters

```python
def add(item, bucket=None):
    if bucket is None:
        bucket = []             # a fresh list on each call
    bucket.append(item)
    return bucket

print(add(1))                   # [1]
print(add(2))                   # [2]
```

### Infinity

```python
import math

pos = float("inf")
neg = float("-inf")
print(pos == math.inf)          # True
print(pos > 10 ** 400)          # True  (bigger than any int)
print(neg < -1e308)             # True
print(pos + 1, -pos)            # inf -inf
print(pos - pos)                # nan
print(math.isinf(neg))          # True
print(math.isfinite(1.5))       # True
```

### Use it in a loop

```python
import math

nums = [7, 3, 9, 1]
smallest = float("inf")
largest = float("-inf")
for n in nums:
    smallest = min(smallest, n)
    largest = max(largest, n)
print(smallest, largest)        # 1 9

dist = [math.inf] * 4           # "unreached" in a shortest-path table
dist[0] = 0
print(dist)                     # [0, inf, inf, inf]
print(min([], default=None))    # None  (empty input, no error)
```

### NaN and big limits

```python
import math
import sys

nan = float("nan")
print(nan == nan)               # False  (NaN equals nothing)
print(math.isnan(nan))          # True
print(sys.maxsize)              # 9223372036854775807  (not an int limit)
print(sys.float_info.max)       # 1.7976931348623157e+308
print(2 ** 100)                 # 1267650600228229401496703205376
```

| Value | Write | Test |
| --- | --- | --- |
| null | `None` | `x is None` |
| infinity | `math.inf`, `float("inf")` | `math.isinf(x)` |
| negative infinity | `-math.inf`, `float("-inf")` | `x == -math.inf` |
| not a number | `math.nan`, `float("nan")` | `math.isnan(x)` |

### Gotchas

- Test for `None` with `is None`, not `== None`.
- `if not x:` is also true for `0`, `""`, and `[]`. Use `x is None` when those are valid values.
- `int(math.inf)` raises `OverflowError`. Infinity only exists as a float.
- `null`, `nil`, and `undefined` don't exist in Python. They raise `NameError`.
