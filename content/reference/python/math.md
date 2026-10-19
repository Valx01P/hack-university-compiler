# Math Operators

`/` always returns a float, `//` is floor division, and `**` is power. Integers never overflow, they just grow.

### Arithmetic

```python
print(7 + 2)       # 9
print(7 - 2)       # 5
print(7 * 2)       # 14
print(7 / 2)       # 3.5   always a float
print(6 / 2)       # 3.0
print(7 // 2)      # 3     floor division
print(7 % 2)       # 1     remainder
print(2 ** 10)     # 1024  power
print(-7 // 2)     # -4    floors toward negative infinity
print(-7 % 3)      # 2     result takes the sign of the divisor
print(7.0 // 2)    # 3.0   float in, float out
```

### Compound assignment

```python
x = 10
x += 5      # x = x + 5
print(x)    # 15
x -= 3      # x = x - 3
x *= 2      # x = x * 2
x //= 5     # x = x // 5
print(x)    # 4
x **= 2     # x = x ** 2
x %= 5      # x = x % 5
x /= 2      # x = x / 2
print(x)    # 0.5
```

There is no `++` or `--`. Write `i += 1`.

### Precedence

```python
print(2 + 3 * 4)      # 14
print((2 + 3) * 4)    # 20
print(-2 ** 2)        # -4   ** binds tighter than unary minus
print((-2) ** 2)      # 4
print(2 ** 3 ** 2)    # 512  ** groups right to left
print(10 - 4 - 3)     # 3    everything else left to right
```

| Level | Operators |
| --- | --- |
| 1, binds tightest | `**` |
| 2 | unary `-x`, `+x` |
| 3 | `*`, `/`, `//`, `%` |
| 4 | `+`, `-` |
| 5 | comparisons, then `not`, `and`, `or` |

`abs`, `round`, `divmod`, `pow`, `min`, `max`, and `sum` need no import. See Built-in Functions.

### The math module

```python
import math

print(math.sqrt(16))           # 4.0
print(math.isqrt(17))          # 4   integer square root
print(math.floor(-2.5))        # -3
print(math.ceil(2.1))          # 3
print(math.trunc(-2.7))        # -2
print(math.gcd(12, 18))        # 6
print(math.lcm(4, 6))          # 12
print(math.factorial(5))       # 120
print(math.comb(5, 2))         # 10  ways to choose 2 of 5
print(math.perm(5, 2))         # 20  ordered picks of 2 of 5
print(math.prod([2, 3, 4]))    # 24
print(math.log(8, 2))          # 3.0
print(math.log10(1000))        # 3.0
print(math.hypot(3, 4))        # 5.0
print(math.pi)                 # 3.141592653589793
print(math.sin(math.pi / 2))   # 1.0  trig uses radians
```

### Use it in a loop

```python
n = 1234
digit_sum = 0
while n > 0:
    digit_sum += n % 10     # last digit
    n //= 10                # drop last digit
print(digit_sum)            # 10
```

### Floats are approximate

```python
import math
from decimal import Decimal
from fractions import Fraction

print(0.1 + 0.2)                        # 0.30000000000000004
print(0.1 + 0.2 == 0.3)                 # False
print(math.isclose(0.1 + 0.2, 0.3))     # True
print(Decimal("0.1") + Decimal("0.2"))  # 0.3
print(Fraction(1, 3) + Fraction(1, 6))  # 1/2
```

### Gotchas

- `/` returns a float even when it divides evenly, so `items[len(items) / 2]` is a `TypeError`. Use `//`.
- `-7 // 2` is `-4` and `-7 % 3` is `2`, unlike C and Java. For C-style results use `int(-7 / 2)` and `math.fmod(-7, 3)`.
- `^` is bitwise XOR, not power. `2 ^ 3` is `1`. Use `2 ** 3`.
- `x++` is a `SyntaxError`, and `++x` silently does nothing.
