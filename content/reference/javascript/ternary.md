# Ternary

`condition ? valueIfTrue : valueIfFalse` is an `if`/`else` that produces a
value, so it fits inside assignments, template literals and returns.

### Basic

```javascript
const age = 20;
const label = age >= 18 ? "adult" : "minor";
console.log(label);                                    // adult
console.log(`You are ${age >= 18 ? "an adult" : "a minor"}`); // You are an adult
```

### Chained

One condition per line reads like `else if`.

```javascript
const n = -4;
const sign = n > 0 ? "positive"
  : n < 0 ? "negative"
  : "zero";
console.log(sign); // negative
```

### In a return

```javascript
const abs = (x) => (x < 0 ? -x : x);
function max(a, b) {
  return a > b ? a : b;
}
console.log(abs(-3), max(4, 9)); // 3 9
```

### Defaults without a ternary

```javascript
const nick = "";
console.log(nick ? nick : "anonymous"); // anonymous
console.log(nick || "anonymous");       // anonymous, the short form
```

`??` (only `null` and `undefined`) versus `||` (any falsy value) is in Infinity and Null.

### Use it in a loop

```javascript
for (let i = 1; i <= 4; i++) {
  console.log(`${i} is ${i % 2 === 0 ? "even" : "odd"}`);
}
// 1 is odd
// 2 is even
// 3 is odd
// 4 is even

for (const count of [0, 1, 2]) {
  console.log(`${count} item${count === 1 ? "" : "s"}`);
}
// 0 items
// 1 item
// 2 items
```

### Gotchas

- `?:` binds loosely: `"Total: " + n > 0 ? "yes" : "no"` tests the joined string. Wrap the ternary in parentheses.
- It needs both branches. For "do something only if", use a plain `if`.
- Past two levels of nesting, an `if`/`else if` chain or a lookup object is easier to read.
