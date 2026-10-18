# Ternary

Python's ternary is a conditional expression: `a if condition else b`. The condition sits in the middle, and there is no `? :`.

### Basic

```python
age = 20
status = "adult" if age >= 18 else "minor"
print(status)                       # adult
```

### Inline in calls and f-strings

```python
n = 3
print("even" if n % 2 == 0 else "odd")      # odd
print(f"{n} item{'' if n == 1 else 's'}")   # 3 items
```

### Chained

```python
score = 85
grade = "A" if score >= 90 else "B" if score >= 80 else "C"
print(grade)                        # B
```

Past two branches, `if` / `elif` is easier to read.

### Use it in a loop

```python
for i in range(1, 5):
    print(i, "even" if i % 2 == 0 else "odd")    # 1 odd, 2 even, ...

nums = [1, -2, 3, -4]
clipped = [n if n > 0 else 0 for n in nums]
print(clipped)                      # [1, 0, 3, 0]
positives = [n for n in nums if n > 0]
print(positives)                    # [1, 3]  (a filter, no else)
```

### Shortcuts that replace a ternary

```python
a, b = 4, 9
print(max(a, b))                    # 9  instead of a if a > b else b

name = ""
print(name or "anonymous")          # anonymous  (any falsy value)
print(name if name is not None else "anonymous")   # prints an empty line, "" is kept
```

### Gotchas

- The `else` is required. `x = 1 if ok` is a `SyntaxError`.
- `cond ? a : b` is a `SyntaxError` in Python.
- The old `cond and a or b` trick fails when `a` is falsy: `True and 0 or 5` is `5`.
- The ternary binds loosest: `"x" + "y" if ok else "z"` means `("x" + "y") if ok else "z"`. Add parentheses when mixing.
