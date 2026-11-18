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

### Letter arithmetic with ord and chr

```python
print(ord("c") - ord("a"))          # 2  a letter's index, 0 to 25
print(chr(ord("a") + 2))            # c  and back
print(ord("7") - ord("0"))          # 7  a digit's value
counts = [0] * 26
for ch in "banana":
    counts[ord(ch) - ord("a")] += 1
print(counts[:3])                   # [3, 1, 0]  a, b, c
print(chr((ord("y") - ord("a") + 3) % 26 + ord("a")))   # b  shift by 3, wrapping
```

### Palindromes and anagrams

```python
from collections import Counter

w = "Racecar".lower()
print(w == w[::-1])                              # True  a palindrome
print(sorted("listen") == sorted("silent"))      # True  an anagram, O(n log n)
print(Counter("listen") == Counter("silent"))    # True  the same check, O(n)
print("".join(sorted("tea")))                    # aet  the key that groups anagrams
```

Two pointers that skip punctuation are in Two Pointers and Windows.

### Match a pattern by hand

```python
def find(text, pattern):
    for i in range(len(text) - len(pattern) + 1):
        j = 0
        while j < len(pattern) and text[i + j] == pattern[j]:
            j += 1
        if j == len(pattern):
            return i
    return -1

print(find("sadbutsad", "sad"), find("leetcode", "leeto"))   # 0 -1
print("sadbutsad".find("sad"))       # 0  the built-in, to check your answer
```

### Longest common prefix

```python
words = ["flower", "flow", "flight"]
prefix = []
for chars in zip(*words):           # the i-th letter of every word, up to the shortest
    if len(set(chars)) != 1:
        break
    prefix.append(chars[0])
print("".join(prefix))              # fl
```

### Expand around each center

The longest palindrome inside a string: grow outward from each letter (odd length) and each gap (even length).

```python
def longest_palindrome(s):
    best = ""
    for center in range(len(s)):
        for lo, hi in ((center, center), (center, center + 1)):
            while lo >= 0 and hi < len(s) and s[lo] == s[hi]:
                lo -= 1
                hi += 1
            if hi - lo - 1 > len(best):      # > keeps the first on a tie
                best = s[lo + 1:hi]
    return best

print(longest_palindrome("babad"), longest_palindrome("cbbd"))   # bab bb
```

### Parse an integer by hand

```python
def parse_int(s):
    i, n = 0, len(s)
    while i < n and s[i] == " ":
        i += 1
    sign = 1
    if i < n and s[i] in "+-":
        sign = -1 if s[i] == "-" else 1
        i += 1
    value = 0
    while i < n and s[i].isdigit():
        value = value * 10 + ord(s[i]) - ord("0")
        i += 1
    return max(-2**31, min(2**31 - 1, sign * value))   # clamp to 32 bits

print(parse_int("   -42abc"), parse_int("+7"), parse_int("99999999999"))   # -42 7 2147483647
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
