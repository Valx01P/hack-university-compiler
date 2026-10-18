# Variables and Types

Declare with `const` when the name never gets a new value and `let` when it
does. Types belong to values, not variables: `typeof` tells you what a value is
right now.

### Declare

```javascript
const name = "Ada"; // can't be reassigned
let count = 0;      // can be reassigned
count = count + 1;
let later;          // undefined until you assign it
later = "now";
console.log(name, count, later); // Ada 1 now
```

### Types

| Type | Examples | `typeof` |
| --- | --- | --- |
| number | `42`, `3.14`, `-1`, `NaN`, `Infinity` | `"number"` |
| bigint | `12345678901234567890n` | `"bigint"` |
| string | `"hi"`, `'hi'`, `` `hi ${x}` `` | `"string"` |
| boolean | `true`, `false` | `"boolean"` |
| undefined | `undefined` | `"undefined"` |
| null | `null` | `"object"` (an old quirk) |
| object | `{ a: 1 }`, `[1, 2]`, `new Map()` | `"object"` |
| function | `function f() {}`, `() => 1` | `"function"` |

### Check a type

```javascript
console.log(typeof 42);              // number
console.log(typeof "hi");            // string
console.log(typeof undefined);       // undefined
console.log(typeof [1, 2]);          // object
console.log(Array.isArray([1, 2]));  // true
console.log(Number.isInteger(5.0));  // true
console.log(Number.isInteger(5.5));  // false
```

### Numbers

There is one number type, a 64-bit float, for both whole numbers and decimals.

```javascript
console.log(7 / 2);                   // 3.5
console.log(0.1 + 0.2);               // 0.30000000000000004
console.log(1_000_000);               // 1000000
console.log(0xff, 0b101, 1e3);        // 255 5 1000
console.log(Number.MAX_SAFE_INTEGER); // 9007199254740991
console.log(2n ** 64n);               // 18446744073709551616n
```

### Convert

```javascript
console.log(Number("42") + 1);      // 43
console.log(+"7" + 1);              // 8
console.log(Number("4x"));          // NaN
console.log(parseInt("42px", 10));  // 42
console.log(parseFloat("3.5kg"));   // 3.5
console.log(String(42) + 1);        // 421
console.log(parseInt("ff", 16));    // 255
console.log((255).toString(2));     // 11111111
console.log(Boolean(""), !!"hi");   // false true
```

Which values count as false in an `if` (falsy) is in Conditions and Logic.

### const holds the reference

```javascript
const nums = [1, 2];
nums.push(3);        // fine: the array changes, the binding does not
// nums = [];        // TypeError: Assignment to constant variable.
console.log(nums);   // [ 1, 2, 3 ]
```

### Use it in a loop

```javascript
const inputs = ["4.50", "2", "abc", "1.5"];
let total = 0;
for (const text of inputs) {
  const n = Number(text);
  if (Number.isNaN(n)) continue;
  total += n;
}
console.log(total); // 8
```

### Gotchas

- `+` joins if either side is a string: `"5" + 1` is `"51"`, but `"5" - 1` is `4`. Convert input with `Number()` first.
- `typeof null` is `"object"`. Test for null with `x === null`.
- Integers above 2 ** 53 lose precision. Use BigInt (`10n`), and note that `1n + 1` throws a TypeError: you can't mix BigInt and number.
- Don't use `var`. It is function-scoped and hoisted, so it leaks out of blocks. Reading a `let` or `const` before its line throws a ReferenceError.
