# Printing Variables

Template literals are the everyday way: backticks with `${...}` around any
expression. `console.log` with commas also works and adds the spaces for you.

### Template literals

```javascript
const name = "Ada";
const age = 36;
console.log(`${name} is ${age}`);           // Ada is 36
console.log(`Next year: ${age + 1}`);       // Next year: 37
console.log(`${age >= 18 ? "adult" : "minor"}`); // adult
console.log(`Upper: ${name.toUpperCase()}`); // Upper: ADA
```

### Commas and +

```javascript
const name = "Ada";
const age = 36;
console.log(name, "is", age);     // Ada is 36
console.log(name + " is " + age); // Ada is 36
console.log("%s is %d", name, age); // Ada is 36
```

### Decimals

```javascript
const price = 3.14159;
console.log(price.toFixed(2));                 // 3.14
console.log(`$${price.toFixed(2)}`);           // $3.14
console.log((2).toFixed(2));                   // 2.00
console.log(Math.round(price * 100) / 100);    // 3.14 (stays a number)
```

### Padding and alignment

```javascript
console.log("7".padStart(3, "0"));         // 007
console.log(String(42).padStart(6) + "|"); //     42|
console.log("ab".padEnd(5, ".") + "|");    // ab...|
console.log("-".repeat(10));               // ----------
```

### Thousands separators, percent, currency

```javascript
const n = 1234567.891;
console.log(n.toLocaleString("en-US"));                    // 1,234,567.891
console.log((0.256).toLocaleString("en-US", { style: "percent" })); // 26%
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
console.log(usd.format(1234.5));                          // $1,234.50
```

### Arrays and objects in a string

```javascript
const user = { name: "Ada", langs: ["js", "py"] };
console.log(`user: ${user}`);                 // user: [object Object]
console.log(`user: ${JSON.stringify(user)}`); // user: {"name":"Ada","langs":["js","py"]}
console.log(`langs: ${user.langs}`);          // langs: js,py
console.log(`langs: ${user.langs.join(", ")}`); // langs: js, py
```

### Use it in a loop

```javascript
const items = [["apple", 1.5], ["banana", 0.25], ["cherry", 12]];
for (const [item, cost] of items) {
  console.log(`${item.padEnd(8)}${cost.toFixed(2).padStart(7)}`);
}
// apple      1.50
// banana     0.25
// cherry    12.00
```

### Formatting calls

| Call | Does |
| --- | --- |
| `` `${x}` `` | puts any expression into a string |
| `n.toFixed(2)` | string with exactly 2 decimals |
| `s.padStart(5, "0")` | pads on the left to length 5 |
| `s.padEnd(10)` | pads on the right with spaces |
| `n.toLocaleString("en-US")` | thousands separators |
| `JSON.stringify(obj)` | object or array as readable text |
| `require("util").format("%s=%d", k, v)` | printf-style string without printing |

### Gotchas

- Template literals need backticks. `"Hi ${name}"` in normal quotes prints the `${name}` text as-is.
- `toFixed` returns a string, so `price.toFixed(2) + 1` is `"3.141"`. Do the math first, format last.
- `toFixed` rounds the binary value: `(1.005).toFixed(2)` is `"1.00"`, not `"1.01"`.
- An object in a template prints `[object Object]`. Use `JSON.stringify`.
