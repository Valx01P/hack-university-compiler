# Switch

Python's switch is `match` / `case` (added in 3.10). Cases never fall through, so there is no `break`, and `case _:` is the default. It also matches shapes: sequences, dicts, and objects.

### match and case

```python
command = "stop"
match command:
    case "start":
        print("starting")
    case "stop" | "halt":           # either value
        print("stopping")           # stopping
    case _:                         # default
        print("unknown")
```

### Guards

```python
n = -4
match n:
    case 0:
        print("zero")
    case x if x < 0:                # x captures n, then the if must hold
        print("negative", x)        # negative -4
    case _:
        print("positive")
```

### Sequences

```python
for cmd in ["go north", "take key lamp", "look", ""]:
    match cmd.split():
        case ["go", direction]:
            print("going", direction)       # going north
        case ["take", *things]:
            print("taking", things)         # taking ['key', 'lamp']
        case [word]:
            print("one word:", word)        # one word: look
        case []:
            print("empty")                  # empty
```

### Dicts and types

```python
event = {"type": "click", "x": 3, "y": 4}
match event:
    case {"type": "click", "x": x, "y": y}:     # extra keys are fine
        print(f"click at {x},{y}")              # click at 3,4
    case {"type": "key", "key": k}:
        print("key", k)

for value in [7, 2.5, "hi", [1, 2]]:
    match value:
        case bool():
            print("bool")
        case int() | float():
            print("number", value)      # number 7, number 2.5
        case str():
            print("text", value)        # text hi
        case _:
            print("other", value)       # other [1, 2]
```

### Constants and classes

```python
from enum import Enum

class Color(Enum):
    RED = 1
    GREEN = 2

class Point:
    __match_args__ = ("x", "y")

    def __init__(self, x, y):
        self.x, self.y = x, y

match Color.GREEN:
    case Color.RED:                     # dotted names compare by value
        print("red")
    case Color.GREEN:
        print("green")                  # green

match Point(0, 5):
    case Point(x=0, y=0):
        print("origin")
    case Point(0, y):                   # positional, uses __match_args__
        print("on the y axis at", y)    # on the y axis at 5
```

### Dict lookup instead

```python
names = {1: "Mon", 2: "Tue", 3: "Wed"}
print(names.get(2, "unknown"))      # Tue
print(names.get(9, "unknown"))      # unknown

ops = {"+": lambda a, b: a + b, "*": lambda a, b: a * b}
print(ops["*"](3, 4))               # 12
```

### Gotchas

- A bare name in a case captures, it doesn't compare. `case limit:` matches anything and binds `limit`. Use literals or dotted names like `Color.RED`.
- Put `case _:` last. A catch-all before other cases is a `SyntaxError`.
- `case [a, b]:` matches lists and tuples but never a string.
- `True` is an `int`, so `case int():` also matches booleans. Put `case bool():` first when it matters.
