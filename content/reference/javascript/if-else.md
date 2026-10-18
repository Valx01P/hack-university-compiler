# If and Else

Chain with `else if` (two words). The first branch whose condition is true
runs and the rest are skipped.

### if, else if, else

```javascript
const score = 72;
if (score >= 90) {
  console.log("A");
} else if (score >= 80) {
  console.log("B");
} else if (score >= 70) {
  console.log("C");
} else {
  console.log("F");
}
// C
```

### Set a variable from the branches

```javascript
const temp = 30;
let advice;
if (temp > 25) {
  advice = "shorts";
} else {
  advice = "jacket";
}
console.log(advice); // shorts

const wear = temp > 25 ? "shorts" : "jacket"; // same thing as a ternary
```

### Early return instead of nesting

```javascript
function divide(a, b) {
  if (b === 0) {
    return null;
  }
  return a / b;
}
console.log(divide(6, 3)); // 2
console.log(divide(1, 0)); // null
```

### Nested

```javascript
const loggedIn = true;
const isAdmin = false;
if (loggedIn) {
  if (isAdmin) {
    console.log("admin panel");
  } else {
    console.log("dashboard"); // dashboard
  }
} else {
  console.log("please log in");
}
```

A chain that maps one value to another reads better as a lookup object (see Switch).

### Use it in a loop

```javascript
const out = [];
for (let i = 1; i <= 15; i++) {
  if (i % 15 === 0) {
    out.push("FizzBuzz");
  } else if (i % 3 === 0) {
    out.push("Fizz");
  } else if (i % 5 === 0) {
    out.push("Buzz");
  } else {
    out.push(i);
  }
}
console.log(out.join(" "));
// 1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```

### Gotchas

- Order matters: put the most specific test first. With `i % 3` before `i % 15`, 15 prints `Fizz`.
- Without braces only the next statement belongs to the `if`. A second indented line always runs.
- `let` and `const` declared inside a branch disappear after it. Declare the variable before the `if` when you need it later.
- There is no `elif` or `elsif`. It is `else if`.
