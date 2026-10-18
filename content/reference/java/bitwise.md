# Bitwise Operations

Bitwise operators work on the binary digits of `int` and `long` values. An `int` is 32 bits in two's complement, so negative numbers have their top bit set. Java has two right shifts: `>>` keeps the sign, `>>>` fills with zeros.

### Operators

With `a = 0b1100` (12) and `b = 0b1010` (10):

| Operator | Does |
| --- | --- |
| `a & b` | AND, 1 where both are 1: `0b1000` (8) |
| `a \| b` | OR, 1 where either is 1: `0b1110` (14) |
| `a ^ b` | XOR, 1 where they differ: `0b0110` (6) |
| `~a` | NOT, flips every bit: -13 |
| `a << 2` | shift left, times 4: 48 |
| `a >> 2` | shift right keeping the sign, divide by 4: 3 |
| `a >>> 2` | shift right filling zeros (differs for negatives) |

```java
int a = 0b1100, b = 0b1010;      // binary literals
System.out.println(a & b);       // 8
System.out.println(a | b);       // 14
System.out.println(a ^ b);       // 6
System.out.println(~a);          // -13, because ~x == -x - 1
System.out.println(-16 >> 2);    // -4
System.out.println(-1 >>> 1);    // 2147483647
```

### See and parse binary

```java
Integer.toBinaryString(12);        // "1100"
Integer.toBinaryString(-1);        // "11111111111111111111111111111111", all 32 bits
Integer.parseInt("1010", 2);       // 10
String.format("%8s", Integer.toBinaryString(5)).replace(' ', '0'); // "00000101"
Integer.toHexString(255);          // "ff"
int hex = 0xFF;                    // 255, a hex literal
int high = 0b1111_0000;            // 240, underscores group the digits
```

### Single bits

Bit `i` counts from 0 at the right.

```java
int x = 0b1010;
int i = 1;
boolean on = ((x >> i) & 1) == 1;  // true, test bit i
int set = x | (1 << 0);            // 11 (0b1011), set bit 0
int cleared = x & ~(1 << 1);       // 8  (0b1000), clear bit 1
int toggled = x ^ (1 << 3);        // 2  (0b0010), toggle bit 3

int flags = 0;
flags |= 1 << 2;                   // compound forms: &= |= ^= <<= >>=
```

### Common tricks

```java
boolean odd = (7 & 1) == 1;               // true, works for negatives too
int n = 16;
boolean pow2 = n > 0 && (n & (n - 1)) == 0; // true
int lowest = 12 & -12;                    // 4, the lowest set bit
int p = 3, q = 5;
p ^= q;
q ^= p;
p ^= q;                                   // swapped: p 5, q 3

int[] nums = {4, 1, 2, 1, 2};
int single = 0;
for (int v : nums) {
    single ^= v;                          // pairs cancel out
}
System.out.println(single);               // 4
```

### Count and find bits

```java
Integer.bitCount(13);              // 3, 13 is 0b1101
Integer.highestOneBit(13);         // 8
Integer.numberOfTrailingZeros(12); // 2
Integer.numberOfLeadingZeros(1);   // 31
Long.bitCount(-1L);                // 64
```

### Loop over all subsets

Each number from `0` to `2^m - 1` is a mask that picks a subset.

```java
char[] items = {'a', 'b', 'c'};
int m = items.length;
for (int mask = 0; mask < (1 << m); mask++) {
    StringBuilder sb = new StringBuilder("{");
    for (int j = 0; j < m; j++) {
        if ((mask & (1 << j)) != 0) sb.append(items[j]);
    }
    System.out.print(sb.append("} "));
}
// {} {a} {b} {ab} {c} {ac} {bc} {abc}
```

### Gotchas

- `==` binds tighter than `&`, so `x & 1 == 0` does not compile ("bad operand types"). Write `(x & 1) == 0`.
- Shift counts wrap modulo 32 for `int`: `1 << 32` is `1` and `1 << 40` is `256`. Use `1L << 40` for a `long`.
- `-5 >> 1` is `-3` (rounds down) while `-5 / 2` is `-2` (rounds toward zero).
- `byte` is signed: `(byte) 0b1111_0000` is `-16`. Use `b & 0xFF` to get `240`.
