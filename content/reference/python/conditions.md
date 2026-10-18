# Conditions and Logic

Comparisons return `True` or `False`. The logic operators are the words `and`, `or`, and `not`, and comparisons chain like in math: `0 <= i < n`.

### Compare

```python
x = 5
print(x == 5, x != 3)           # True True
print(x < 10, x <= 5)           # True True
print(x > 1, x >= 6)            # True False
print(1 < x < 10)               # True  chained, same as 1 < x and x < 10
print("apple" < "banana")       # True  strings compare alphabetically
print("Z" < "a")                # True  uppercase sorts first
print([1, 2] == [1, 2])         # True  compares contents
print((1, 9) < (2, 0))          # True  item by item
```

### Combine

```python
age, member = 20, False
print(age >= 18 and member)     # False
print(age >= 18 or member)      # True
print(not member)               # True
print(not age > 30 and age > 10)    # True  not binds tightest, then and, then or
```

### Membership and identity

```python
print("a" in "cat")             # True  substring
print(3 in [1, 2, 3])           # True
print("k" in {"k": 1})          # True  checks dict keys
print(5 not in range(5))        # True
x = None
print(x is None)                # True
print(x is not None)            # False
```

| Operator | Means |
| --- | --- |
| `==`, `!=` | equal, not equal (by value) |
| `<`, `<=`, `>`, `>=` | ordering, chainable |
| `and`, `or`, `not` | logic, short-circuit |
| `in`, `not in` | member of a string, list, set, dict keys |
| `is`, `is not` | same object, use for `None` |

### Truthiness

Falsy: `False`, `None`, `0`, `0.0`, `""`, `[]`, `()`, `{}`, `set()`. Everything else is truthy.

```python
name = ""
items = [0]
if not name:
    print("no name")            # no name  ("" is falsy)
if items:
    print("has items")          # has items  ([0] is a non-empty list)
```

### Short-circuit returns a value

```python
print(None or "default")        # default
print("" or "fallback")         # fallback
print("set" or "fallback")      # set
print(0 and 1 / 0)              # 0  (the right side never runs)
items = []
if items and items[0] > 0:      # safe on an empty list
    print("first is positive")
```

### any and all

```python
nums = [3, 8, -1]
print(any(n < 0 for n in nums))     # True
print(all(n > 0 for n in nums))     # False
print(all([]))                      # True  (nothing failed)
```

### Use it in a loop

```python
scores = [72, 105, 90, -3, 58]
for s in scores:
    if s < 0 or s > 100:
        print(s, "invalid")
    elif 60 <= s < 90:
        print(s, "pass")
    elif s >= 90:
        print(s, "great")
    else:
        print(s, "fail")
```

```text
72 pass
105 invalid
90 great
-3 invalid
58 fail
```

### Gotchas

- There is no `&&`, `||`, or `!`. `&` and `|` are bitwise and bind tighter than `==`, so `x > 1 & x < 5` means `x > (1 & x) < 5`.
- `x == 1 or 2` is always truthy. Write `x == 1 or x == 2`, or `x in (1, 2)`.
- `is` checks identity, not value. Compare numbers and strings with `==`, and use `is` only for `None`.
- Compare floats with `math.isclose(a, b)`, not `==`.
