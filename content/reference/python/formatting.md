# Printing Variables

Use f-strings: put `f` before the quote and any expression inside `{}`. A format spec after a colon, like `{price:.2f}`, controls decimals, padding, and commas.

### f-strings

```python
name, age = "Ada", 36
print(f"{name} is {age}")         # Ada is 36
print(f"Next year: {age + 1}")    # Next year: 37
print(f"{name.upper()}!")         # ADA!
print(f"{age = }")                # age = 36  (debug form, shows the expression)
print(f"{name!r}")                # 'Ada'  (repr)
```

### Numbers

```python
pi = 3.14159265
print(f"{pi:.2f}")            # 3.14
print(f"{pi:.0f}")            # 3
print(f"{1234567:,}")         # 1,234,567
print(f"{1234.5:,.2f}")       # 1,234.50
print(f"{0.256:.1%}")         # 25.6%
print(f"{42:05d}")            # 00042
print(f"{255:x} {255:b}")     # ff 11111111
print(f"{1500000:.2e}")       # 1.50e+06
```

### Width and alignment

```python
print(f"[{'hi':<6}]")         # [hi    ]
print(f"[{'hi':>6}]")         # [    hi]
print(f"[{'hi':^6}]")         # [  hi  ]
print(f"[{7:*>4}]")           # [***7]
w = 5
print(f"[{'x':>{w}}]")        # [    x]  (width from a variable)
```

| Spec | Does |
| --- | --- |
| `.2f` | fixed point, 2 decimals |
| `,` or `_` | thousands separator |
| `.1%` | multiply by 100, add `%` |
| `05d` | integer, zero-padded to width 5 |
| `<8`, `>8`, `^8` | left, right, center in width 8 |
| `*^8` | fill with `*` instead of spaces |
| `x`, `b`, `o` | hex, binary, octal |
| `.2e` | scientific notation |
| `!r` | use `repr()` instead of `str()` |

### Use it in a loop

```python
rows = [("apple", 1.5, 3), ("kiwi", 0.25, 12)]
for item, price, qty in rows:
    print(f"{item:<8}{price:>6.2f}{qty:>4}")
```

```text
apple     1.50   3
kiwi      0.25  12
```

### Other ways

```python
name, age = "Ada", 36
print("Name:", name, "Age:", age)            # Name: Ada Age: 36
print("Name: " + name + ", " + str(age))     # Name: Ada, 36
print("{} is {}".format(name, age))          # Ada is 36
print("{n} is {a}".format(n=name, a=age))    # Ada is 36
print("%s is %d" % (name, age))              # Ada is 36  (old style)
```

### Braces and quotes inside

```python
print(f"{{literal}}")         # {literal}
d = {"k": 1}
print(f"{d['k']}")            # 1  (3.12 also allows f"{d["k"]}")
text = f"""Name: {d['k']}
Done"""                       # triple quotes span lines
```

### Gotchas

- Forget the `f` and nothing is filled in: `"{name}"` prints `{name}`.
- A number spec needs a number: `f"{'3':.2f}"` raises `ValueError`. Convert text from `input()` first.
- `.0f` and `round` round half to even: `f"{2.5:.0f}"` is `2`, `f"{3.5:.0f}"` is `4`.
- `f"{x:.2f}"` changes only the text. `x` keeps every digit, so round with `round(x, 2)` if the value itself must change.
