# Math Operators

Every number is a 64-bit float, so `/` always gives the exact quotient with
decimals. There is no integer division operator: use `Math.floor(a / b)`.

### Arithmetic

```javascript
console.log(7 + 2);   // 9
console.log(7 - 2);   // 5
console.log(7 * 2);   // 14
console.log(7 / 2);   // 3.5
console.log(7 % 2);   // 1 (remainder)
console.log(2 ** 10); // 1024
```

### Integer division

```javascript
console.log(Math.floor(7 / 2));  // 3
console.log(Math.floor(-7 / 2)); // -4 (rounds down)
console.log(Math.trunc(-7 / 2)); // -3 (drops the decimals, like C and Java)
```

### Remainder with negatives

```javascript
console.log(-7 % 3);             // -1 (takes the sign of the left side)
console.log(((-7 % 3) + 3) % 3); // 2 (always 0 to 2, a true modulo)
```

### Assignment shortcuts, ++ and --

```javascript
let x = 10;
x += 5;  console.log(x); // 15
x -= 3;  console.log(x); // 12
x *= 2;  console.log(x); // 24
x /= 4;  console.log(x); // 6
x %= 4;  console.log(x); // 2
x **= 3; console.log(x); // 8
x++;     console.log(x); // 9
x--;     console.log(x); // 8

let i = 5;
console.log(i++); // 5 (returns the old value, then i is 6)
console.log(++i); // 7 (adds first, then returns)
```

| Call | Does |
| --- | --- |
| `a / b` | exact quotient, `7 / 2` is `3.5` |
| `Math.floor(a / b)` | integer division (rounds down) |
| `a % b` | remainder, sign of `a` |
| `a ** b` | power |
| `x += n`, `x++` | update in place |

`Math.sqrt`, `Math.round`, `Math.max`, random numbers and the rest of `Math`
are in Built-in Functions.

### Big integers

```javascript
console.log(2 ** 64);   // 18446744073709552000 (precision lost)
console.log(2n ** 64n); // 18446744073709551616n
console.log(7n / 2n);   // 3n (BigInt division drops the decimals)
console.log(Number(10n) + 1); // 11
```

### Safe integers and big products

Whole numbers are exact only up to `Number.MAX_SAFE_INTEGER`, 2^53 - 1. Two numbers near 1e9 multiply past it, so do the product in `BigInt`.

```javascript
console.log(Number.MAX_SAFE_INTEGER);        // 9007199254740991
console.log(2 ** 53 + 1 === 2 ** 53);        // true, past the limit numbers skip
console.log(Number.isSafeInteger(2 ** 53));  // false
console.log(123456789 * 987654321);          // 121932631112635260, the last digit is wrong
console.log(BigInt(123456789) * 987654321n); // 121932631112635269n
const MOD = 1_000_000_007;
console.log(Number((BigInt(123456789) * 987654321n) % BigInt(MOD)));  // 259106859

const INT_MAX = 2 ** 31 - 1;                 // the 32-bit range many problems clamp to
const INT_MIN = -(2 ** 31);
console.log(INT_MAX, INT_MIN, 2 ** 31 > INT_MAX);  // 2147483647 -2147483648 true
```

### Fast power under a modulus

```javascript
function powMod(base, exp, mod) {
  let result = 1n;
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;  // this bit of the exponent is set
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(result);
}
console.log(powMod(2, 10, 1000), powMod(3, 200, 1_000_000_007));  // 24 136318165
```

### GCD, LCM, and Infinity as a start

```javascript
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;
console.log(gcd(48, 18), lcm(4, 6));  // 6 12

let smallest = Infinity;              // any number beats it
let largest = -Infinity;
for (const x of [4, -2, 9]) {
  smallest = Math.min(smallest, x);
  largest = Math.max(largest, x);
}
console.log(smallest, largest);       // -2 9
console.log(Math.min(), Math.max());  // Infinity -Infinity, with nothing to compare
```

### Use it in a loop

```javascript
let sum = 0;
let product = 1;
for (let n = 1; n <= 5; n++) {
  sum += n;
  product *= n;
}
console.log(sum, product); // 15 120

let num = 9475;
let digitSum = 0;
while (num > 0) {
  digitSum += num % 10;
  num = Math.floor(num / 10);
}
console.log(digitSum); // 25
```

### Gotchas

- `/` never drops decimals. Use `Math.floor(a / b)` when you want whole numbers.
- Dividing by zero is not an error: `5 / 0` is `Infinity` and `0 / 0` is `NaN`. Check the divisor yourself.
- `0.1 + 0.2 === 0.3` is false. Compare floats with `Math.abs(a - b) < 1e-9`.
- `-2 ** 2` is a SyntaxError. Write `(-2) ** 2` or `-(2 ** 2)`.
