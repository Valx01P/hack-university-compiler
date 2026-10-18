# Built-in Functions

Built-ins need no import: `len`, `min`, `max`, `sum`, `abs`, `pow`, `round`, `sorted` and friends are always there. Extra math (`sqrt`, `floor`, `gcd`) lives in the `math` module, see Math Operators.

### Numbers

```python
abs(-7)             # 7
pow(2, 10)          # 1024  same as 2 ** 10
2 ^ 10              # 8     careful, ^ is XOR, not power
pow(2, 10, 1000)    # 24    (2 ** 10) % 1000, fast for big powers
round(3.14159, 2)   # 3.14
round(7.5)          # 8
divmod(17, 5)       # (3, 2)  quotient and remainder
int(3.99)           # 3   truncates toward zero
int(-3.99)          # -3
```

### min, max, sum

```python
nums = [4, 9, 1, 7]
min(nums)                       # 1
max(nums)                       # 9
max(3, 8, 5)                    # 8  also takes separate arguments
sum(nums)                       # 21
sum(nums, 100)                  # 121  with a start value
max([], default=0)              # 0  instead of a ValueError

words = ["kiwi", "fig", "banana"]
min(words, key=len)             # 'fig'
max(words, key=len)             # 'banana'
```

### Sequences

```python
len("hello")                    # 5
sorted([3, 1, 2])               # [1, 2, 3]
sorted([3, 1, 2], reverse=True) # [3, 2, 1]
list(reversed([1, 2, 3]))       # [3, 2, 1]
list(enumerate("ab"))           # [(0, 'a'), (1, 'b')]
list(zip([1, 2], "ab"))         # [(1, 'a'), (2, 'b')]
list(range(3))                  # [0, 1, 2]
```

### Apply and test over a list

```python
nums = [4, 9, 1, 7]
list(map(str, nums))                    # ['4', '9', '1', '7']
list(filter(lambda n: n > 5, nums))     # [9, 7]
any(n > 8 for n in nums)                # True  at least one
all(n > 0 for n in nums)                # True  every one
list(map(int, "1 2 3".split()))         # [1, 2, 3]  parse a line of numbers
```

### Convert and inspect

```python
int("101", 2)       # 5   from base 2
bin(10)             # '0b1010'
hex(255)            # '0xff'
oct(8)              # '0o10'
ord("a"), chr(98)   # (97, 'b')
type(3.0)           # <class 'float'>
isinstance(3, int)  # True
```

`int`, `float`, `str`, `bool`, `list`, and `set` as converters are in Variables and Types.

### Iterators

```python
it = iter([1, 2, 3])
next(it)                        # 1
next(it)                        # 2
list(it)                        # [3]  what is left
next(it, None)                  # None  default instead of StopIteration
```

### Use it in a loop

```python
scores = {"ana": 82, "bo": 95, "cy": 77}
best = max(scores, key=scores.get)          # 'bo'
for name in sorted(scores):
    print(name, abs(scores[name] - 80))     # ana 2, bo 15, cy 3
```

| Call | Does |
| --- | --- |
| `len(x)` | number of items |
| `min(xs)` / `max(xs)` | smallest / largest, takes `key=` and `default=` |
| `sum(xs)` | add numbers up |
| `abs(x)` | absolute value |
| `pow(a, b)` / `pow(a, b, m)` | power / power mod m |
| `round(x, n)` | round to n decimals |
| `divmod(a, b)` | `(a // b, a % b)` |
| `sorted(xs)` | new sorted list |
| `reversed(xs)` | iterator, back to front |
| `enumerate(xs)` / `zip(a, b)` | index pairs / parallel pairs |
| `map(f, xs)` / `filter(f, xs)` | apply / keep, lazily |
| `any(...)` / `all(...)` | some true / all true |
| `int` `float` `str` `bool` `list` `set` | convert |
| `ord(ch)` / `chr(n)` | character to code point and back |
| `bin(n)` / `hex(n)` | integer to a base-2 / base-16 string |
| `next(it, default)` | next item of an iterator |
| `isinstance(x, T)` | type check |

### Gotchas

- `round` rounds halves to the even neighbor: `round(2.5)` is `2`, `round(3.5)` is `4`.
- `max([])` raises `ValueError`. Pass `default=` when the list can be empty.
- Naming a variable `list`, `sum`, `max`, or `str` hides the built-in for the rest of the scope, then `sum(xs)` fails with `TypeError`.
- `map`, `filter`, `zip`, and `reversed` return one-shot iterators. Wrap in `list(...)` to print or reuse them.
