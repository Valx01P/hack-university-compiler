# Bitwise Operations

Bitwise operators work on the binary digits of integers. Python ints have unlimited size and no unsigned type, so negative numbers act as if they had infinitely many leading 1 bits (two's complement).

### Operators

```python
a, b = 0b1100, 0b1010     # 12, 10
print(a & b)              # 8    AND: 1 where both are 1   (0b1000)
print(a | b)              # 14   OR: 1 where either is 1   (0b1110)
print(a ^ b)              # 6    XOR: 1 where they differ  (0b0110)
print(~a)                 # -13  NOT: flips every bit, equals -a - 1
print(a << 2)             # 48   shift left: times 2**2
print(a >> 2)             # 3    shift right: floor divide by 2**2
print(-12 >> 2)           # -3   right shift keeps the sign
```

Compound forms exist for all of them: `&=`, `|=`, `^=`, `<<=`, `>>=`.

### See and write binary

```python
n = 10
print(bin(n))                 # 0b1010
print(f"{n:b}", f"{n:08b}")   # 1010 00001010
print(format(n, "04b"))       # 1010
print(hex(255), f"{255:x}")   # 0xff ff
print(int("1010", 2))         # 10
print(int("ff", 16))          # 255
print(n.bit_length())         # 4  bits needed
print(n.bit_count())          # 2  number of 1 bits
```

### Single-bit tricks

```python
x = 0b1010
i = 1
print(x >> i & 1)             # 1   is bit i set?
print(bin(x | (1 << 2)))      # 0b1110   set bit 2
print(bin(x & ~(1 << 1)))     # 0b1000   clear bit 1
print(bin(x ^ (1 << 0)))      # 0b1011   toggle bit 0
print(bin(x & -x))            # 0b10     lowest set bit
print(bin(x & (x - 1)))       # 0b1000   drop the lowest set bit
```

| Expression | Means |
| --- | --- |
| `n & 1` | 1 if n is odd |
| `n > 0 and (n & (n - 1)) == 0` | n is a power of two |
| `1 << k` | 2 to the k, a mask with only bit k set |
| `(1 << k) - 1` | a mask of the low k bits |
| `x & 0xFF` | keep the low 8 bits |
| `a ^ b ^ b` | gives back a (XOR undoes itself) |

### Loop over bits and subsets

```python
n = 0b10110
for i in range(n.bit_length()):
    if n >> i & 1:
        print(i, end=" ")             # 1 2 4
print()

items = ["a", "b", "c"]
for mask in range(1 << len(items)):   # every subset, 2**3 of them
    subset = [items[i] for i in range(len(items)) if mask >> i & 1]
    print(f"{mask:03b}", subset)      # 000 [] ... 111 ['a', 'b', 'c']

nums = [4, 1, 2, 1, 2]
single = 0
for v in nums:
    single ^= v                       # pairs cancel out
print(single)                         # 4
```

### Flags

```python
from enum import IntFlag

class Perm(IntFlag):
    READ = 1
    WRITE = 2
    EXEC = 4

p = Perm.READ | Perm.WRITE
print(Perm.WRITE in p, Perm.EXEC in p)    # True False
p &= ~Perm.WRITE
print(p == Perm.READ)                     # True
```

### Fixed-width (32-bit) results

```python
MASK = 0xFFFFFFFF
x = ~5 & MASK                 # as an unsigned 32-bit value
print(x)                      # 4294967290
signed = x - (1 << 32) if x >> 31 else x
print(signed)                 # -6
```

### Gotchas

- Precedence: `+` and `-` bind tighter than shifts, and shifts tighter than `&`. So `1 << n - 1` is `1 << (n - 1)` and `x & 1 + 1` is `x & 2`. Add parentheses when in doubt.
- `~5` is `-6`, not `250` or `4294967290`. Mask with `& 0xFF` or `& 0xFFFFFFFF` for a fixed width.
- `and`, `or`, `not` are the logical operators. `&` and the pipe also work on bools, but they don't short-circuit.
- There is no `>>>` operator. Mask the value first to get an unsigned shift.
