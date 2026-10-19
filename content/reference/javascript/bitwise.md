# Bitwise Operations

Bitwise operators work on the binary digits of a number. JavaScript converts both sides to a **32-bit signed integer** first, works bit by bit, and gives back a regular number. For anything wider than 32 bits, use `BigInt` (`1n << 40n`).

### Operators

```javascript
const a = 0b1100;
const b = 0b1010;
console.log(a, b);       // 12 10

console.log(a & b);      // 8    (0b1000)  AND: 1 where both are 1
console.log(a | b);      // 14   (0b1110)  OR: 1 where either is 1
console.log(a ^ b);      // 6    (0b0110)  XOR: 1 where they differ
console.log(~a);         // -13            NOT: flips every bit, so ~x is -x - 1
console.log(a << 1);     // 24             shift left: times 2 per step
console.log(a >> 2);     // 3              shift right, keeps the sign: -16 >> 2 is -4
console.log(-16 >>> 28); // 15             shift right, fills with 0 (unsigned)
```

| Operator | Name | Example |
| --- | --- | --- |
| `&` | AND | `12 & 10` is `8` |
| `\|` | OR | `12 \| 10` is `14` |
| `^` | XOR | `12 ^ 10` is `6` |
| `~` | NOT | `~12` is `-13` |
| `<<` | left shift | `1 << 4` is `16` |
| `>>` | right shift, sign kept | `-9 >> 1` is `-5` |
| `>>>` | right shift, zero filled | `-1 >>> 0` is `4294967295` |

### See and write binary

```javascript
console.log(0b1011);                            // 11, also 0xff (hex) and 0o17 (octal)
console.log((5).toString(2));                   // 101
console.log((5).toString(2).padStart(8, "0"));  // 00000101
console.log(parseInt("1011", 2));               // 11
console.log((-5).toString(2));                  // -101, a sign, not two's complement
console.log((-5 >>> 0).toString(2));            // 11111111111111111111111111111011
```

### Single bits

```javascript
const x = 0b1010;
const i = 1;

console.log((x >> i) & 1);           // 1, read bit i
console.log((x & (1 << i)) !== 0);   // true, same test as a boolean
console.log(x | (1 << 0));           // 11 (0b1011), set bit 0
console.log(x & ~(1 << 1));          // 8  (0b1000), clear bit 1
console.log(x ^ (1 << 3));           // 2  (0b0010), toggle bit 3
```

### Common tricks

```javascript harness
const n = 6;
{{code}}
console.log(`6 is even: ${(n & 1) === 0}`);
console.log(`isPow2(64): ${isPow2(64)}`);
```

```javascript
(n & 1) === 0;                          // even?
const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;   // isPow2(64) is true
console.log(12 & -12);                  // 4, the lowest set bit
console.log(31 - Math.clz32(40));       // 5, index of the highest set bit

function popcount(n) {                  // count the 1 bits
  let count = 0;
  while (n !== 0) {
    n &= n - 1;                         // drops the lowest 1 bit
    count++;
  }
  return count;
}
console.log(popcount(0b1011));          // 3

console.log([4, 1, 2, 1, 2].reduce((acc, v) => acc ^ v, 0));  // 4, the value without a pair
```

### Flags

```javascript
const READ = 1, WRITE = 2, EXEC = 4;    // one bit each
let perms = READ | WRITE;
console.log((perms & WRITE) !== 0);     // true
console.log((perms & EXEC) !== 0);      // false
perms &= ~WRITE;                        // remove WRITE
console.log(perms);                     // 1
```

### Every subset with a mask

```javascript
const items = ["a", "b", "c"];
for (let mask = 0; mask < 1 << items.length; mask++) {
  const subset = items.filter((_, j) => mask & (1 << j));
  console.log(mask.toString(2).padStart(3, "0"), subset.join(""));
}
// 000, 001 a, 010 b, 011 ab, 100 c, 101 ac, 110 bc, 111 abc
```

### Gotchas

- Precedence: `n & 1 === 0` means `n & (1 === 0)`, which is always `0`. Write `(n & 1) === 0`.
- Only 32 bits: `1 << 31` is `-2147483648`, `1 << 32` is `1`, and `3000000000 | 0` is `-1294967296`. Use `BigInt` or plain math for bigger values.
- `x | 0` truncates toward zero (`-7.9 | 0` is `-7`) but breaks past 32 bits. `Math.trunc` is safer.
- `>>` on a negative number rounds down: `-9 >> 1` is `-5`, like `Math.floor(-9 / 2)`.
