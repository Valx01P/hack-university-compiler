# Exceptions

Python reports errors by raising exceptions. Catch them with `try` / `except`, raise your own with `raise`. The Python style is "easier to ask forgiveness than permission": try the operation, handle the failure.

### try / except / else / finally

```python
def parse(text):
    try:
        n = int(text)
    except ValueError:
        print(f"not a number: {text!r}")
        return None
    else:                         # runs only if nothing was raised
        return n
    finally:                      # always runs, even after return
        print("done")

print(parse("42"))                # done, then 42
print(parse("x"))                 # not a number: 'x', done, then None
```

### Catch several kinds

```python
data = {"a": [1, 2]}
for key, i in [("a", 5), ("b", 0), ("a", 1)]:
    try:
        print(data[key][i])       # 2 on the last pass
    except (KeyError, IndexError) as e:
        print(type(e).__name__, e)    # IndexError list index out of range, KeyError 'b'
```

Order matters: put specific exceptions before general ones. `except Exception as e:` catches almost everything, so keep it last, and avoid a bare `except:`.

### Raise

```python
def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > balance:
        raise RuntimeError(f"insufficient funds: {balance}")
    return balance - amount

try:
    withdraw(10, 50)
except RuntimeError as e:
    print("Error:", e)            # Error: insufficient funds: 10
```

Inside an `except` block, a bare `raise` re-raises the current exception unchanged.

### Custom exceptions

```python
class AppError(Exception):
    """Base for this program's errors."""

class NotFound(AppError):
    def __init__(self, key):
        super().__init__(f"{key} not found")
        self.key = key

try:
    raise NotFound("user 7")
except AppError as e:             # catches the subclass too
    print(e, "|", e.key)          # user 7 not found | user 7
```

### Chain causes

```python
try:
    try:
        {}["port"]
    except KeyError as e:
        raise ValueError("bad config") from e   # keeps the original as __cause__
except ValueError as e:
    print(e, "<-", repr(e.__cause__))           # bad config <- KeyError('port')
```

### Clean up with `with`

```python
import os
from contextlib import suppress

with open("notes.txt", "w") as f:     # closed even if an error happens
    f.write("hi\n")

with suppress(FileNotFoundError):     # ignore one specific error
    os.remove("missing.txt")
```

### Retry in a loop

```python
inputs = ["abc", "", "7"]
for raw in inputs:
    try:
        value = int(raw)
        break
    except ValueError:
        print(f"retrying after {raw!r}")
print(value)                      # 7
```

### Common built-in exceptions

| Exception | Raised when |
| --- | --- |
| `ValueError` | right type, bad value: `int("x")` |
| `TypeError` | wrong type: `"a" + 1` |
| `KeyError` | missing dict key |
| `IndexError` | list index out of range |
| `AttributeError` | no such attribute or method |
| `ZeroDivisionError` | `1 / 0` or `1 % 0` |
| `FileNotFoundError` | `open` on a missing file |
| `RecursionError` | recursion deeper than about 1000 calls |
| `StopIteration` | `next()` on an exhausted iterator |
| `AssertionError` | `assert x > 0, "message"` fails |

`except*` and `ExceptionGroup` (3.11+) handle several errors raised together, and `e.add_note("...")` attaches extra context to the traceback.

### Gotchas

- A bare `except:` also catches `KeyboardInterrupt` and `SystemExit`. Catch `Exception` at most.
- Don't silence errors with `except Exception: pass`. At least print or log `e`.
- Keep the `try` block small, so you don't catch errors from lines you didn't mean to guard.
- `assert` is skipped when Python runs with `-O`. Don't use it to validate user input.
