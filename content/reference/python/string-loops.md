# Looping Over Strings

A string is a sequence of characters, so `for ch in s` works just like a list. Strings can't be changed, so to build a new one, collect pieces in a list and `"".join` them at the end.

### Each character

```python
for ch in "cat":
    print(ch)                   # c, a, t
```

### With the index

```python
s = "cat"
for i, ch in enumerate(s):
    print(i, ch)                # 0 c, 1 a, 2 t

for i in range(len(s)):
    print(i, s[i])              # 0 c, 1 a, 2 t

i = 0
while i < len(s):
    print(s[i])                 # c, a, t
    i += 1
```

### Backwards and every other

```python
for ch in reversed("cat"):
    print(ch)                   # t, a, c

print("cat"[::-1])              # tac
print("abcdef"[::2])            # ace
print("abcdef"[1::2])           # bdf
```

### Count characters

```python
from collections import Counter

s = "Hello World 42"
vowels = 0
digits = 0
for ch in s:
    if ch.lower() in "aeiou":
        vowels += 1
    elif ch.isdigit():
        digits += 1
print(vowels, digits)           # 3 2

print(Counter("banana"))        # Counter({'a': 3, 'n': 2, 'b': 1})
print(Counter("banana").most_common(1))    # [('a', 3)]
```

### Build a new string

```python
s = "h3ll0 w0rld"
out = []
for ch in s:
    if ch.isalpha():
        out.append(ch.upper())
print("".join(out))             # HLLWRLD

print("".join(ch for ch in s if ch != " "))    # h3ll0w0rld
```

### Shift letters with ord and chr

```python
def caesar(text, k):
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr((ord(ch) - ord("a") + k) % 26 + ord("a")))
        else:
            out.append(ch)
    return "".join(out)

print(caesar("xyz abc", 3))     # abc def
```

### Words and lines

```python
sentence = "the quick brown fox"
for word in sentence.split():
    print(word, len(word))      # the 3, quick 5, brown 5, fox 3

text = "line one\nline two"
for n, line in enumerate(text.splitlines(), start=1):
    print(n, line)              # 1 line one, 2 line two
```

### Compare neighbors, runs of a character

```python
from itertools import groupby

s = "aaabccdd"
runs = []
count = 1
for i in range(1, len(s) + 1):
    if i < len(s) and s[i] == s[i - 1]:
        count += 1
    else:
        runs.append(f"{s[i - 1]}{count}")
        count = 1
print("".join(runs))            # a3b1c2d2

print("".join(f"{ch}{len(list(g))}" for ch, g in groupby(s)))   # a3b1c2d2
```

### Both ends: palindrome check

```python
def is_palindrome(s):
    s = "".join(ch.lower() for ch in s if ch.isalnum())
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i += 1
        j -= 1
    return True

print(is_palindrome("Race car!"))  # True
```

| Want | Write |
| --- | --- |
| each character | `for ch in s` |
| index and character | `for i, ch in enumerate(s)` |
| backwards | `reversed(s)` or `s[::-1]` |
| each word | `for w in s.split()` |
| each line | `for line in s.splitlines()` |
| letter counts | `Counter(s)` from `collections` |
| code point | `ord(ch)`, and back with `chr(n)` |
| build output | `out.append(...)`, then `"".join(out)` |

### Gotchas

- `ch = ch.upper()` inside the loop doesn't change `s`. Build a new string.
- `s += ch` in a loop works, but on long strings `"".join(list)` is much faster.
- `ch.isdigit()` is a method call. `ch.isdigit` without `()` is always truthy.
- `"" in s` is always `True`, so an empty search string matches every string.
