# Conditions and Logic

`if (condition) { ... }` runs the block when the condition is truthy. Compare
with `===` and `!==`, the strict versions that never convert types.

### if

```javascript
const age = 20;
if (age >= 18) {
  console.log("adult"); // adult
}
if (age > 65) console.log("senior"); // one statement can skip the braces
```

### Comparison operators

| Call | Does |
| --- | --- |
| `a === b` / `a !== b` | equal / not equal, same type and value |
| `a == b` / `a != b` | loose: converts types first (avoid) |
| `a < b`, `a > b`, `a <= b`, `a >= b` | order, numbers or strings |

```javascript
console.log(5 === 5);            // true
console.log(5 === "5");          // false
console.log(5 == "5");           // true (converted, avoid)
console.log("apple" < "banana"); // true (dictionary order)
console.log("10" < "9");         // true (compared as strings)
console.log(10 < 9);             // false
console.log("Ab".toLowerCase() === "aB".toLowerCase()); // true
```

### Logical operators

| Call | Does |
| --- | --- |
| `a && b` | and: true when both are |
| `a \|\| b` | or: true when either is |
| `!a` | not |
| `a ?? b` | `b` only when `a` is `null` or `undefined` |

```javascript
const x = 7;
console.log(x > 0 && x < 10); // true
console.log(x < 0 || x > 5);  // true
console.log(!(x > 5));        // false
console.log(10 < x && x < 20); // false (no chained 10 < x < 20)
```

### They return a value, not just true or false

```javascript
console.log(0 || "default");    // default
console.log("" ?? "default");   // (empty line: "" is not null)
console.log("a" && "b");        // b
const user = null;
console.log(user && user.name); // null
console.log(!!"text");          // true (force a boolean)
```

### Truthy and falsy

`false`, `0`, `-0`, `0n`, `""`, `null`, `undefined` and `NaN` are falsy.
Everything else is truthy, including `"0"`, `" "`, `[]` and `{}`.

```javascript
const items = [];
if (items) console.log("runs: [] is truthy");     // runs: [] is truthy
if (items.length > 0) console.log("has items");   // (skipped)
```

### Use it in a loop

```javascript
const temps = [12, 25, 31, -3, 18];
for (const t of temps) {
  if (t < 0) console.log(`${t}: freezing`);
  if (t >= 15 && t <= 25) console.log(`${t}: nice`);
  if (t > 30 || t < -10) console.log(`${t}: extreme`);
}
// 25: nice
// 31: extreme
// -3: freezing
// 18: nice
```

### Gotchas

- `if (x = 5)` assigns and is always true. Comparison is `===`.
- `==` has odd rules (`"" == 0` is true, `null == 0` is false). Use `===` everywhere except `x == null`.
- `1 < 3 < 2` is true: it runs as `(1 < 3) < 2`, then `true < 2`. Write `a < b && b < c`.
- `[1] === [1]` is false: arrays and objects compare by reference. Compare elements or `JSON.stringify` both.
