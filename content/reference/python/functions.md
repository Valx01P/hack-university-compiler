# Functions

Define a function with `def`, indent the body, and `return` a value. A function with no `return` returns `None`. Functions must be defined before the line that calls them runs.

### Define and call

```python
def add(a, b):
    return a + b

print(add(2, 3))            # 5

def greet(name):
    """Print a greeting. This string is the docstring."""
    print(f"Hi {name}")

result = greet("Ana")       # prints Hi Ana
print(result)               # None
```

### Default and keyword arguments

```python
def power(base, exp=2):
    return base ** exp

print(power(3))                 # 9
print(power(2, 10))             # 1024
print(power(exp=3, base=2))     # 8  by name, any order

def box(w, h, *, fill="#"):     # after *, keyword only
    return "\n".join(fill * w for _ in range(h))

print(box(3, 2, fill="o"))      # ooo, ooo on two lines
```

### Return several values

```python
def min_max(xs):
    return min(xs), max(xs)     # a tuple

lo, hi = min_max([4, 1, 9])
print(lo, hi)                   # 1 9
```

### Any number of arguments

```python harness
def add(a, b):
    return a + b


{{code}}
```

```python
def total(*nums):                     # nums is a tuple
    return sum(nums)

print(total(1, 2, 3))                 # 6

def tag(name, **attrs):               # attrs is a dict
    return name + "".join(f" {k}={v}" for k, v in attrs.items())

print(tag("img", src="a.png", w=20))  # img src=a.png w=20

args = [5, 7]
print(add(*args))                     # 12  unpack a list into arguments
```

### Lambdas and functions as values

```python
square = lambda x: x * x
print(square(4))                            # 16

words = ["kiwi", "fig", "banana"]
print(sorted(words, key=len))               # ['fig', 'kiwi', 'banana']
print(sorted(words, key=lambda w: w[-1]))   # ['banana', 'fig', 'kiwi']
print(max(words, key=len))                  # banana

def apply_twice(f, x):
    return f(f(x))

print(apply_twice(square, 3))               # 81
```

### Use it in a loop

```python
def is_prime(n):
    if n < 2:
        return False
    for d in range(2, int(n ** 0.5) + 1):
        if n % d == 0:
            return False
    return True

primes = [n for n in range(20) if is_prime(n)]
print(primes)                   # [2, 3, 5, 7, 11, 13, 17, 19]
```

### Scope: global and nonlocal

```python
count = 0

def bump():
    global count                # needed to assign a module variable
    count += 1

bump()
print(count)                    # 1

def make_counter():
    n = 0
    def step():
        nonlocal n              # assign the enclosing function's n
        n += 1
        return n
    return step

c = make_counter()
print(c())                      # 1
print(c())                      # 2
```

### Recursion and caching

```python
from functools import cache

def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)

print(fact(5))                  # 120

@cache                          # memoize: arguments must be hashable
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(80))                  # 23416728348467685
```

### Type hints (optional, not enforced)

```python
def average(xs: list[float]) -> float:
    return sum(xs) / len(xs)

def find(xs: list[int], target: int) -> int | None:
    return xs.index(target) if target in xs else None

print(average([1.0, 2.0, 4.5]))  # 2.5
```

| Syntax | Means |
| --- | --- |
| `def f(a, b=1):` | `b` is optional, default 1 |
| `f(b=2, a=1)` | pass by name |
| `def f(*args):` | extra positional arguments as a tuple |
| `def f(**kwargs):` | extra keyword arguments as a dict |
| `def f(a, *, b):` | `b` must be passed by name |
| `f(*xs)` / `f(**d)` | spread a list / dict into arguments |
| `lambda x: x + 1` | small unnamed function |
| `return a, b` | return a tuple |

### Gotchas

- A mutable default is shared across calls: `def f(x, items=[])` keeps growing. Use `items=None`, then `if items is None: items = []`.
- Forgetting `return` gives `None`, and `None` then breaks the caller (`TypeError: unsupported operand`).
- Assigning to a name inside a function makes it local. Reading a global then assigning it raises `UnboundLocalError` unless you declare `global`.
- Recursion stops at about 1000 levels (`RecursionError`). Raise it with `sys.setrecursionlimit` or rewrite as a loop.
