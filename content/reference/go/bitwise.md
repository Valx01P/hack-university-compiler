# Bitwise Operations

Bitwise operators work on the binary digits of integers. Go has the usual set plus `&^` (AND NOT), and it spells NOT as unary `^`, not `~`.

### Operators

```go
a, b := 12, 10      // 1100, 1010
fmt.Println(a & b)  // 8   (1000) AND: both bits set
fmt.Println(a | b)  // 14  (1110) OR: either bit set
fmt.Println(a ^ b)  // 6   (0110) XOR: bits differ
fmt.Println(a &^ b) // 4   (0100) AND NOT: clear b's bits from a
fmt.Println(^a)     // -13 NOT: flip every bit
fmt.Println(a << 2) // 48  shift left: times 4
fmt.Println(a >> 2) // 3   shift right: divide by 4

var u uint8 = 12
fmt.Println(^u) // 243 (11110011), unsigned NOT stays positive
```

| Operator | Name | Example |
| --- | --- | --- |
| `&` | AND | `12 & 10` is 8 |
| `\|` | OR | `12 \| 10` is 14 |
| `^` (two operands) | XOR | `12 ^ 10` is 6 |
| `&^` | AND NOT (bit clear) | `12 &^ 10` is 4 |
| `^x` (one operand) | NOT | `^12` is -13 |
| `<<` / `>>` | shift | `1 << 3` is 8 |
| `&=` `\|=` `^=` `&^=` `<<=` `>>=` | assign forms | `x \|= 1` |

### See the bits

```go
import "strconv"

fmt.Printf("%b\n", 12)                  // 1100
fmt.Printf("%08b\n", 12)                // 00001100
fmt.Printf("%x %X %o\n", 255, 255, 8)   // ff FF 10
fmt.Println(strconv.FormatInt(12, 2))   // 1100
n, _ := strconv.ParseInt("1100", 2, 64) // 12
fmt.Println(0b1100, 0xff, 0o17, 1_000)  // 12 255 15 1000
```

### Get, set, clear, toggle one bit

```go
x := 0b1010
i := 1
fmt.Println(x>>i&1 == 1) // true: is bit i set?
x |= 1 << 2              // set bit 2:    1110
x &^= 1 << 1             // clear bit 1:  1100
x ^= 1 << 0              // toggle bit 0: 1101
fmt.Printf("%04b\n", x)  // 1101
```

### Common tricks

```go harness
package main

import "fmt"

func main() {
	x := 0b1101 // 13, from the block above
	{{code}}
}
```

```go
fmt.Println(x&1 == 1)       // odd number
fmt.Println(16&(16-1) == 0) // true: power of two (for n > 0)
fmt.Println(12 & -12)       // 4: lowest set bit

nums := []int{4, 1, 2, 1, 2}
single := 0
for _, v := range nums {
	single ^= v // pairs cancel out
}
fmt.Println(single) // 4
```

### Flags with iota

```go
const (
	Read  = 1 << iota // 1 (001)
	Write             // 2 (010)
	Exec              // 4 (100)
)

perms := Read | Write
if perms&Write != 0 {
	fmt.Println("can write")
}
perms &^= Write
fmt.Println(perms) // 1
```

### Loop over every subset with a bitmask

```go
items := []string{"a", "b", "c"}
size := len(items)
for mask := 0; mask < 1<<size; mask++ {
	var subset []string
	for i := 0; i < size; i++ {
		if mask&(1<<i) != 0 {
			subset = append(subset, items[i])
		}
	}
	fmt.Print(subset, " ")
}
// [] [a] [b] [a b] [c] [a c] [b c] [a b c]
```

### math/bits

```go
import "math/bits"

fmt.Println(bits.OnesCount(uint(12))) // 2: count set bits
fmt.Println(bits.Len(12))             // 4: bits needed
fmt.Println(bits.TrailingZeros(12))   // 2
fmt.Println(bits.LeadingZeros8(12))   // 4
fmt.Println(bits.Reverse8(1))         // 128
```

### Gotchas

- `^x` is NOT, not power. Use `math.Pow` or `1 << n` for powers of two.
- In Go `&` binds tighter than `==`, so `x&1 == 0` works as you'd expect (unlike C). Add parentheses anyway when mixing with `+` or `-`.
- Shifts drop overflow silently: a `uint8` of 200 shifted left once is 144.
- `>>` on a negative signed int keeps the sign (`-8 >> 1` is -4). Use unsigned types for raw bit patterns.
