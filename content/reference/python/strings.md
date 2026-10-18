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
msg = f"{name} has {n} items"   # 'Ana has 3 items', see Printing Variables
len(a)                          # 5
```

### Index and slice

```python
s = "Python"
s[0]                # 'P'
s[-1]               # 'n'
s[1:4]              # 'yth'
s[:2]               # 'Py'
s[2:]               # 'thon'
s[::-1]             # 'nohtyP'  reversed
s[::2]              # 'Pto'
```

### Case and whitespace

```python
"Hello".upper()             # 'HELLO'
"Hello".lower()             # 'hello'
"hello world".title()       # 'Hello World'
"hello".capitalize()        # 'Hello'
"  hi  ".strip()            # 'hi'
"  hi  ".lstrip()           # 'hi  '
"line\n".rstrip()           # 'line'
"xxhixx".strip("x")         # 'hi'
"7".zfill(3)                # '007'
"ab".ljust(5, ".")          # 'ab...'
"ab".rjust(5)               # '   ab'
"ab".center(6, "*")         # '**ab**'
```

### Search

```python
s = "banana"
"nan" in s                  # True
s.find("an")                # 1   first index, -1 if missing
s.rfind("an")               # 3   last index
s.index("an")               # 1   like find, but ValueError if missing
s.count("a")                # 3
s.startswith("ba")          # True
s.endswith(("na", "ne"))    # True  any of a tuple
```

### Split and join

```python
"a,b,c".split(",")              # ['a', 'b', 'c']
"  one   two ".split()          # ['one', 'two']  any whitespace
"k=v=w".split("=", 1)           # ['k', 'v=w']  at most 1 split
"a\nb\n".splitlines()           # ['a', 'b']
"-".join(["2024", "01", "05"])  # '2024-01-05'
"".join(["a", "b", "c"])        # 'abc'
" ".join(str(n) for n in [1, 2, 3])   # '1 2 3'
"key: val".partition(": ")      # ('key', ': ', 'val')
```

### Replace and remove

```python
"a-b-c".replace("-", "")        # 'abc'
"aaa".replace("a", "b", 2)      # 'bba'  first 2 only
"test_x".removeprefix("test_")  # 'x'
"data.csv".removesuffix(".csv") # 'data'
```

### Check characters

```python
"abc".isalpha()     # True
"123".isdigit()     # True
"ab12".isalnum()    # True
" \t".isspace()     # True
"abc".islower()     # True
"ABC".isupper()     # True
```

### Build and convert

```python
"ab" + "cd"         # 'abcd'
"5" * 3             # '555'
"n=" + str(42)      # 'n=42'
int("42")           # 42  more conversions in Variables and Types
list("abc")         # ['a', 'b', 'c']
ord("A")            # 65  code point
chr(97)             # 'a'
```

### Compare

```python
"apple" < "banana"          # True  dictionary order
"Zebra" < "apple"           # True  uppercase sorts first
"Hi".lower() == "hi"        # True  case-insensitive compare
sorted(["b", "A", "c"], key=str.lower)   # ['A', 'b', 'c']
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
