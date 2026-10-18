# Infinity and Null

`Infinity`, `-Infinity` and `NaN` are ordinary numbers. For "nothing" there are
two values: `undefined` means never set, `null` means set to nothing on purpose.

### Infinity and -Infinity

```javascript
const inf = Infinity;
const negInf = -Infinity;
console.log(1 / 0);                                 // Infinity
console.log(-1 / 0);                                // -Infinity
console.log(inf > 1e308, negInf < -1e308);          // true true
console.log(Number.POSITIVE_INFINITY === Infinity); // true
console.log(Number.isFinite(inf));                  // false
console.log(Infinity - Infinity);                   // NaN
```

### Use it in a loop

Start a running max at `-Infinity` and a running min at `Infinity`.

```javascript
const nums = [4, -2, 9, 7];
let best = -Infinity;
let worst = Infinity;
for (const n of nums) {
  if (n > best) best = n;
  if (n < worst) worst = n;
}
console.log(best, worst); // 9 -2
```

### Number limits

| Call | Does |
| --- | --- |
| `Number.MAX_SAFE_INTEGER` | largest exact integer, `9007199254740991` |
| `Number.MIN_SAFE_INTEGER` | most negative exact integer, `-9007199254740991` |
| `Number.MAX_VALUE` | largest finite number, about `1.8e308` |
| `Number.MIN_VALUE` | smallest *positive* number, `5e-324` |
| `Number.EPSILON` | gap between `1` and the next float, about `2.2e-16` |

### NaN

```javascript
console.log(0 / 0);               // NaN
console.log(Number("abc"));       // NaN
console.log(NaN === NaN);         // false
console.log(Number.isNaN(NaN));   // true
console.log(isNaN("abc"));        // true (converts the string first)
console.log(Number.isNaN("abc")); // false
```

### null and undefined

```javascript
let notSet;
const empty = null;
const obj = { a: 1 };
function noReturn() {}
console.log(notSet, empty);       // undefined null
console.log(obj.b);               // undefined (missing property)
console.log([1, 2][5]);           // undefined (index out of range)
console.log(noReturn());          // undefined
console.log(typeof notSet);       // undefined
console.log(typeof empty);        // object
console.log(null == undefined);   // true
console.log(null === undefined);  // false
```

### Check for nothing

```javascript
const value = null;
if (value === null) console.log("null");                // null
if (value === undefined) console.log("undefined");      // (skipped)
if (value == null) console.log("null or undefined");    // null or undefined
```

### Defaults and safe access

```javascript
const config = { port: 0, user: null };
console.log(config.port ?? 3000);    // 0 (?? only replaces null and undefined)
console.log(config.port || 3000);    // 3000 (|| replaces any falsy value)
console.log(config.user ?? "guest"); // guest
console.log(config.user?.name);      // undefined, no error
let cache = null;
cache ??= [];
console.log(cache);                  // []
```

### In JSON

```javascript
const data = { a: undefined, b: null, c: Infinity, d: NaN };
console.log(JSON.stringify(data)); // {"b":null,"c":null,"d":null}
```

### Gotchas

- `Number.MIN_VALUE` is a tiny positive number, not the most negative one. Use `-Infinity` or `-Number.MAX_VALUE`.
- `x === NaN` is always false. Use `Number.isNaN(x)`.
- Reading a property of `null` or `undefined` throws a TypeError (`null.name`). Use `?.` when the value may be missing.
- `Math.max()` of an empty array is `-Infinity` and `Math.min()` is `Infinity`. Check `arr.length` first.
