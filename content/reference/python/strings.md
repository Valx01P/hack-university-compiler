# Strings

A `str` is immutable Unicode text. Single and double quotes mean the same thing, and every method returns a new string instead of changing the old one. There is no separate `char` type: a character is a string of length 1.

### Create

```python
a = "hello"
b = 'it\'s'                     # escape a quote, or mix: "it's"
c = """two
lines"""
path = r"C:\new\table"          # raw: backslashes stay as typed
name, n = "Ana", 3
print(f"{name} has {n} items")  # Ana has 3 items, see Printing Variables
print(len(a))                   # 5
```

### Index and slice

```python
s = "Python"
print(s[0])         # P
print(s[-1])        # n
print(s[1:4])       # yth
print(s[:2])        # Py
print(s[2:])        # thon
print(s[::-1])      # nohtyP  reversed
print(s[::2])       # Pto
```

### Case and whitespace

```python
print("Hello".upper())          # HELLO
print("Hello".lower())          # hello
print("hello world".title())    # Hello World
print("hello".capitalize())     # Hello
print("  hi  ".strip())         # hi
print(repr("  hi  ".lstrip()))  # 'hi  '
print("line\n".rstrip())        # line
print("xxhixx".strip("x"))      # hi
print("7".zfill(3))             # 007
print("ab".ljust(5, "."))       # ab...
print(repr("ab".rjust(5)))      # '   ab'
print("ab".center(6, "*"))      # **ab**
```

### Search

```python
s = "banana"
print("nan" in s)                # True
print(s.find("an"))              # 1   first index, -1 if missing
print(s.rfind("an"))             # 3   last index
print(s.index("an"))             # 1   like find, but ValueError if missing
print(s.count("a"))              # 3
print(s.startswith("ba"))        # True
print(s.endswith(("na", "ne")))  # True  any of a tuple
```

### Split and join

```python
print("a,b,c".split(","))              # ['a', 'b', 'c']
print("  one   two ".split())          # ['one', 'two']  any whitespace
print("k=v=w".split("=", 1))           # ['k', 'v=w']  at most 1 split
print("a\nb\n".splitlines())           # ['a', 'b']
print("-".join(["2024", "01", "05"]))  # 2024-01-05
print("".join(["a", "b", "c"]))        # abc
print(" ".join(str(n) for n in [1, 2, 3]))   # 1 2 3
print("key: val".partition(": "))      # ('key', ': ', 'val')
```

### Replace and remove

```python
print("a-b-c".replace("-", ""))         # abc
print("aaa".replace("a", "b", 2))       # bba  first 2 only
print("test_x".removeprefix("test_"))   # x
print("data.csv".removesuffix(".csv"))  # data
```

### Check characters

```python
print("abc".isalpha())   # True
print("123".isdigit())   # True
print("ab12".isalnum())  # True
print(" \t".isspace())   # True
print("abc".islower())   # True
print("ABC".isupper())   # True
```

### Build and convert

```python
print("ab" + "cd")     # abcd
print("5" * 3)         # 555
print("n=" + str(42))  # n=42
print(int("42"))       # 42  more conversions in Variables and Types
print(list("abc"))     # ['a', 'b', 'c']
print(ord("A"))        # 65  code point
print(chr(97))         # a
```

### Compare

```python
print("apple" < "banana")    # True  dictionary order
print("Zebra" < "apple")     # True  uppercase sorts first
print("Hi".lower() == "hi")  # True  case-insensitive compare
print(sorted(["b", "A", "c"], key=str.lower))   # ['A', 'b', 'c']
```

### Use it in a loop

```python
words = ["red", "green", "blue"]
parts = []
for w in words:
    parts.append(w.upper())
print(", ".join(parts))     # RED, GREEN, BLUE
```

| Call | Does |
| --- | --- |
| `s.split(sep)` | list of pieces, whitespace if no `sep` |
| `sep.join(xs)` | glue a list of strings with `sep` |
| `s.strip()` | trim whitespace at both ends |
| `s.replace(a, b)` | swap every `a` for `b` |
| `s.find(x)` | index of `x`, or -1 |
| `s.count(x)` | non-overlapping count of `x` |
| `s.startswith(x)` / `s.endswith(x)` | prefix and suffix tests |
| `s.upper()` / `s.lower()` | change case |
| `s.isdigit()` / `s.isalpha()` | character class tests |
| `s[::-1]` | reversed copy |

### Gotchas

- Strings are immutable: `s[0] = "H"` is a `TypeError`. Build a new one, `s = "H" + s[1:]`.
- Methods return a new string. `s.upper()` on its own line does nothing, write `s = s.upper()`.
- `"5" + 5` is a `TypeError`. Convert first: `"5" + str(5)` or `int("5") + 5`.
- `split()` and `split(" ")` differ: `"a  b".split(" ")` is `['a', '', 'b']`.
