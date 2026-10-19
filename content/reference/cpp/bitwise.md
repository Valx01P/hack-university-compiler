# Bitwise Operations

Bitwise operators work on the binary digits of integers. Use `unsigned` types (or `std::bitset`) when you care about every bit, because shifting and negative numbers get tricky with signed types.

### Operators

```cpp
unsigned a = 0b1100;                  // binary literal
unsigned b = 0b1010;
std::cout << a << ' ' << b << '\n';   // 12 10

std::cout << (a & b) << '\n';         // 8 = 0b1000     AND: 1 where both are 1
std::cout << (a | b) << '\n';         // 14 = 0b1110    OR: 1 where either is 1
std::cout << (a ^ b) << '\n';         // 6 = 0b0110     XOR: 1 where they differ
std::cout << ~a << '\n';              // 4294967283     flips all 32 bits
std::cout << (a << 2) << '\n';        // 48 = 0b110000  shift left, same as * 4
std::cout << (a >> 2) << '\n';        // 3 = 0b11       shift right, same as / 4

a |= 1;   // compound forms: &=  |=  ^=  <<=  >>=
```

| Operator | Name | Example |
|---|---|---|
| `&` | AND | `12 & 10` is `8` |
| `\|` | OR | `12 \| 10` is `14` |
| `^` | XOR | `12 ^ 10` is `6` |
| `~` | NOT | `~0u` is all ones |
| `<<` | left shift | `1 << 4` is `16` |
| `>>` | right shift | `48 >> 2` is `12` |

### Work with single bits

```cpp
std::cout << std::boolalpha;
unsigned x = 0;
int i = 3;

x |= (1u << i);            // set bit i
std::cout << x << '\n';    // 8
bool on = (x >> i) & 1u;   // test bit i
std::cout << on << '\n';   // true
x &= ~(1u << i);           // clear bit i
std::cout << x << '\n';    // 0
x ^= (1u << i);            // toggle bit i
std::cout << x << '\n';    // 8
```

### Print in binary with bitset

```cpp
#include <iostream>
#include <bitset>

std::cout << std::boolalpha;
std::bitset<8> bits(13);
std::cout << bits << '\n';              // 00001101
std::cout << bits.count() << '\n';      // 3, how many 1s
std::cout << bits.test(0) << '\n';      // true, bit 0 is set
bits.set(1);
std::cout << bits << '\n';              // 00001111
bits.flip();
std::cout << bits << '\n';              // 11110000
std::cout << bits.to_ulong() << '\n';   // 240
std::cout << bits.to_string() << '\n';  // 11110000
std::cout << std::bitset<8>("1010").to_ulong() << '\n';   // 10, parse from a string
```

### Common tricks

```cpp
int n = 12, x = 3, y = 5;

bool odd = n & 1;                    // last bit tells odd or even
bool pow2 = n > 0 && (n & (n - 1)) == 0;   // power of two: 8 yes, 6 no
int lowest = n & -n;                 // lowest set bit
std::cout << lowest << '\n';         // 4, from 12
x ^= y; y ^= x; x ^= y;              // swap without a temp (just use std::swap)

std::cout << __builtin_popcount(13) << '\n';  // 3, count 1 bits (g++ builtin, ...ll for long long)
std::cout << __builtin_ctz(12) << '\n';       // 2, trailing zeros (undefined for 0)
```

### Use it in a loop: count bits by hand

```cpp
unsigned n = 13;   // 1101
int ones = 0;
while (n) {
    ones += n & 1;   // look at the last bit
    n >>= 1;         // drop it
}
std::cout << ones << '\n';   // 3
```

### Loop over every subset

Each number from `0` to `2^n - 1` is a subset: bit `i` set means item `i` is in.

```cpp
#include <vector>

std::vector<char> items = {'a', 'b', 'c'};
int n = static_cast<int>(items.size());
for (int mask = 0; mask < (1 << n); mask++) {
    std::cout << '{';
    for (int i = 0; i < n; i++) {
        if (mask & (1 << i)) std::cout << items[i];
    }
    std::cout << "} ";
}
// {} {a} {b} {ab} {c} {ac} {bc} {abc}
```

### Gotchas

- `&`, `|`, and `^` bind weaker than `==`. `x & 1 == 0` means `x & (1 == 0)`. Write `(x & 1) == 0`.
- `1 << 40` overflows an `int`. Use `1LL << 40` or `1ULL << 40` for big shifts.
- Shifting by the type's width or more (like `x << 32` on a 32-bit `int`) is undefined.
- `>>` on a negative signed number keeps the sign bit on g++, and `~5` is `-6`. Use `unsigned` to avoid surprises.
