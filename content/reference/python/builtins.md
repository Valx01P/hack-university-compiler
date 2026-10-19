# Built-in Functions

Built-ins need no import: `len`, `min`, `max`, `sum`, `abs`, `pow`, `round`, `sorted` and friends are always there. Extra math (`sqrt`, `floor`, `gcd`) lives in the `math` module, see Math Operators.

### Numbers

```python
print(abs(-7))              # 7
print(pow(2, 10))           # 1024  same as 2 ** 10
print(2 ^ 10)               # 8     careful, ^ is XOR, not power
print(pow(2, 10, 1000))     # 24    (2 ** 10) % 1000, fast for big powers
print(round(3.14159, 2))    # 3.14
print(round(7.5))           # 8
print(divmod(17, 5))        # (3, 2)  quotient and remainder
print(int(3.99))            # 3   truncates toward zero
print(int(-3.99))           # -3
```

### min, max, sum

```python
nums = [4, 9, 1, 7]
print(min(nums))                # 1
print(max(nums))                # 9
print(max(3, 8, 5))             # 8  also takes separate arguments
print(sum(nums))                # 21
print(sum(nums, 100))           # 121  with a start value
print(max([], default=0))       # 0  instead of a ValueError

words = ["kiwi", "fig", "banana"]
print(min(words, key=len))      # fig
print(max(words, key=len))      # banana
```

### Sequences

```python
print(len("hello"))                     # 5
print(sorted([3, 1, 2]))                # [1, 2, 3]
print(sorted([3, 1, 2], reverse=True))  # [3, 2, 1]
print(list(reversed([1, 2, 3])))        # [3, 2, 1]
print(list(enumerate("ab")))            # [(0, 'a'), (1, 'b')]
print(list(zip([1, 2], "ab")))          # [(1, 'a'), (2, 'b')]
print(list(range(3)))                   # [0, 1, 2]
```

### Apply and test over a list

```python
nums = [4, 9, 1, 7]
print(list(map(str, nums)))                 # ['4', '9', '1', '7']
print(list(filter(lambda n: n > 5, nums)))  # [9, 7]
print(any(n > 8 for n in nums))             # True  at least one
print(all(n > 0 for n in nums))             # True  every one
print(list(map(int, "1 2 3".split())))      # [1, 2, 3]  parse a line of numbers
```

### Convert and inspect

```python
print(int("101", 2))        # 5   from base 2
print(bin(10))              # 0b1010
print(hex(255))             # 0xff
print(oct(8))               # 0o10
print(ord("a"), chr(98))    # 97 b
print(type(3.0))            # <class 'float'>
print(isinstance(3, int))   # True
```

`int`, `float`, `str`, `bool`, `list`, and `set` as converters are in Variables and Types.

### Iterators

```python
it = iter([1, 2, 3])
print(next(it))                 # 1
print(next(it))                 # 2
print(list(it))                 # [3]  what is left
print(next(it, None))           # None  default instead of StopIteration
```

### Use it in a loop

```python
scores = {"ana": 82, "bo": 95, "cy": 77}
print(max(scores, key=scores.get))          # bo
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
