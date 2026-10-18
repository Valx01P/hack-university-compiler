# Printing

`print()` writes its arguments to standard output, separated by spaces, and ends with a newline. Change the separator with `sep=` and the ending with `end=`.

### Basics

```python
print("Hello, world!")        # Hello, world!
print("a", 1, 2.5, True)      # a 1 2.5 True
print()                       # prints an empty line
print("a", "b", sep="-")      # a-b
print("x", "y", sep="")       # xy
print("no newline", end="")
print(" here")                # no newline here
```

### Print a list

```python
nums = [1, 2, 3]
print(nums)                         # [1, 2, 3]
print(*nums)                        # 1 2 3
print(*nums, sep=", ")              # 1, 2, 3
print(", ".join(map(str, nums)))    # 1, 2, 3
print(*nums, sep="\n")              # one per line
```

### Use it in a loop

```python
for i in range(5):
    print(i, end=" ")       # 0 1 2 3 4
print()                     # finish the line

lines = []
for i in range(3):
    lines.append(f"row {i}")
print("\n".join(lines))     # row 0, row 1, row 2 on three lines
```

### Escapes, quotes, and multi-line

```python
print("tab\there")          # tab     here
print("one\ntwo")           # one, then two on the next line
print('She said "hi"')      # She said "hi"
print("It's fine")          # It's fine
print("back\\slash")        # back\slash
print(r"C:\new\table")      # C:\new\table  (raw string, no escapes)
print("""first
second""")                  # two lines, exactly as typed
print("-" * 10)             # ----------
```

### str and repr

```python
word = "hi"
print(word)          # hi
print(repr(word))    # 'hi'
print([word])        # ['hi']  (containers show repr of items)
```

### stderr, flush, raw writes

```python
import sys

print("warning!", file=sys.stderr)    # goes to stderr, not stdout
print("working...", flush=True)       # push it out now
sys.stdout.write("no auto newline\n")
```

| Argument | Does |
| --- | --- |
| `sep=" "` | string placed between arguments |
| `end="\n"` | string printed after the last argument |
| `file=sys.stdout` | where to write (`sys.stderr`, an open file) |
| `flush=False` | `True` forces the output out immediately |

### Gotchas

- `print` is a function in Python 3. `print "hi"` is a `SyntaxError`.
- `print("Total: " + 5)` raises `TypeError`. Use a comma, `str(5)`, or an f-string.
- A comma always adds a space: `print("$", 5)` prints `$ 5`. Use `sep=""` or an f-string.
- `print` returns `None`, so `x = print("hi")` leaves `x` as `None`.
