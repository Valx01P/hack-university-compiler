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
x += 5;  // 15
x -= 3;  // 12
x *= 2;  // 24
x /= 4;  // 6
x %= 4;  // 2
x **= 3; // 8
x++;     // 9
x--;     // 8
console.log(x); // 8

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
