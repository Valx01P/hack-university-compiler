# Variables and Types

A Python variable is just a name bound to a value. There is no declaration or type keyword: the value carries the type, and the same name can later hold a different type.

### Create

```python
count = 10          # int
price = 9.99        # float
name = "Ada"        # str
is_ready = True     # bool
nothing = None      # NoneType, Python's null
count = "ten"       # legal: names are not typed
MAX_SIZE = 100      # a constant by convention only
```

### Core types

| Type | Literal | Notes |
| --- | --- | --- |
| `int` | `42`, `-7`, `1_000_000`, `0xff`, `0b101` | unlimited size, never overflows |
| `float` | `3.14`, `1e-3`, `float("inf")` | 64-bit double |
| `str` | `"hi"`, `'hi'`, `"""multi"""` | immutable text |
| `bool` | `True`, `False` | a subclass of `int` |
| `NoneType` | `None` | the only "no value" |
| `list` | `[1, "a"]` | mutable sequence |
| `tuple` | `(1, 2)`, `(1,)` | immutable sequence |
| `dict` | `{"a": 1}` | key to value, keeps insertion order |
| `set` | `{1, 2}`, `set()` | unique values, no order |

### Check the type

```python
x = 42
print(type(x))                      # <class 'int'>
print(type(x).__name__)             # int
print(isinstance(x, int))           # True
print(isinstance(x, (int, float)))  # True
print(isinstance(True, int))        # True  (bool is an int)
```

### Convert

```python
int("42")           # 42
int(3.99)           # 3  (truncates toward zero)
int(-3.99)          # -3
int("ff", 16)       # 255
int(float("3.5"))   # 3  (int("3.5") is a ValueError)
float("2.5")        # 2.5
str(7)              # '7'
bool(0)             # False
bool("False")       # True  (any non-empty string)
list((1, 2))        # [1, 2]
tuple([1, 2])       # (1, 2)
set([1, 1, 2])      # {1, 2}
```

Which values count as false in an `if` is in Conditions and Logic.

### Type hints (optional)

```python
age: int = 30
scores: list[int] = [90, 85]
nickname: str | None = None
```

Hints document intent. Python does not check them when the program runs.

### Use it in a loop

```python
for v in [1, 2.5, "hi", True, None, [1]]:
    print(type(v).__name__, v)
```

```text
int 1
float 2.5
str hi
bool True
NoneType None
list [1]
```

### Names share objects

```python
a = [1, 2]
b = a           # same list, two names
b.append(3)
print(a)        # [1, 2, 3]
c = a.copy()    # a real copy
c.append(4)
print(a)        # [1, 2, 3]
```

### Gotchas

- `input()` always returns a `str`. Convert with `int(input())` before doing math.
- `int("3.5")` raises `ValueError`. Go through `float` first.
- `b = a` does not copy a list or dict. Both names change together. Use `.copy()`.
- Type hints are not enforced: `age: int = "old"` runs fine.
