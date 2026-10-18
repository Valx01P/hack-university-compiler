# Built-in Functions

Math lives on the global `Math` object (`Math.max`, `Math.sqrt`, ...), and helpers like `parseInt`, `Array.isArray`, and `Object.keys` are global too. Nothing here needs a `require`.

### Min, max, and powers

```javascript
Math.max(3, 7, 2);      // 7
Math.min(3, 7, 2);      // 2
const nums = [4, 9, 1];
Math.max(...nums);      // 9 (spread an array)
Math.min(...nums);      // 1
Math.pow(2, 10);        // 1024
2 ** 10;                // 1024 (same thing)
Math.sqrt(81);          // 9
Math.cbrt(27);          // 3
Math.abs(-5);           // 5
Math.hypot(3, 4);       // 5 (distance, sqrt(3*3 + 4*4))
```

### Rounding and integer division

```javascript
Math.floor(7.8);        // 7 (down)
Math.ceil(7.2);         // 8 (up)
Math.round(7.5);        // 8 (nearest, .5 goes up)
Math.trunc(-7.8);       // -7 (drop the decimals)
Math.floor(17 / 5);     // 3 (integer division)
Math.sign(-3);          // -1
(3.14159).toFixed(2);   // '3.14' (a string, for printing)
```

### Logs, constants, random

```javascript
Math.log(Math.E);       // 1 (natural log)
Math.log2(8);           // 3
Math.log10(1000);       // 3
Math.PI;                // 3.141592653589793
Math.random();          // 0 <= x < 1

const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo; // lo..hi inclusive
const roll = randInt(1, 6);
console.log(roll >= 1 && roll <= 6); // true
```

### Other built-ins you use every day

```javascript
typeof 42;                          // 'number'
Array.isArray([1, 2]);              // true
Number.isInteger(5.0);              // true
Number.isNaN(Number("x"));          // true
Object.keys({ x: 1, y: 2 });        // [ 'x', 'y' ]
Object.values({ x: 1, y: 2 });      // [ 1, 2 ]
Object.entries({ x: 1 });           // [ [ 'x', 1 ] ]
const deep = structuredClone({ list: [1, 2] }); // deep copy
```

Converting between strings and numbers (`Number`, `parseInt`, `String`) is in Variables and Types. `JSON` is in Standard Library.

| Call | Does |
| --- | --- |
| `Math.max(a, b, ...)` / `Math.min(...)` | largest / smallest, `Math.max(...arr)` for arrays |
| `Math.pow(b, e)` or `b ** e` | power |
| `Math.sqrt(x)` / `Math.cbrt(x)` | square / cube root |
| `Math.abs(x)` / `Math.sign(x)` | absolute value / `-1`, `0` or `1` |
| `Math.floor` / `Math.ceil` / `Math.round` / `Math.trunc` | round down / up / nearest / toward 0 |
| `Math.random()` | float in `[0, 1)` |
| `Math.log`, `Math.log2`, `Math.log10` | logarithms |
| `Math.PI`, `Math.E` | constants |
| `Number.isInteger(x)` / `Number.isNaN(x)` | type checks |
| `Object.keys(o)` / `Object.values(o)` / `Object.entries(o)` | arrays from an object |
| `structuredClone(x)` | deep copy |

### Use it in a loop

```javascript
const readings = [12.6, -3.2, 8.9, 15.1];
let hi = -Infinity;
let lo = Infinity;
let total = 0;
for (const r of readings) {
  hi = Math.max(hi, r);
  lo = Math.min(lo, r);
  total += Math.abs(r);
}
console.log(hi, lo, Math.round(total)); // 15.1 -3.2 40
```

### Gotchas

- `Math.max(arr)` gives `NaN`. Spread it: `Math.max(...arr)`. With no arguments, `Math.max()` is `-Infinity`.
- Spreading a huge array (about 130,000 items or more) throws `RangeError: Maximum call stack size exceeded`. Use a loop or `arr.reduce((a, b) => Math.max(a, b))`.
- `Math.round(-2.5)` is `-2`, because halves round toward positive infinity.
- `["1", "2", "3"].map(parseInt)` gives `[ 1, NaN, NaN ]` because `map` passes the index as the radix. Use `.map(Number)`.
