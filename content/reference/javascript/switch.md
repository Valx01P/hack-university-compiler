# Switch

`switch` compares one value against each `case` with `===` and runs from the
first match until a `break`. Without `break` it falls through into the next
case.

### Basic

```javascript
const day = "tue";
switch (day) {
  case "sat":
  case "sun":
    console.log("weekend");
    break;
  case "fri":
    console.log("almost weekend");
    break;
  default:
    console.log("weekday"); // weekday
}
```

Stacked cases (`"sat"` and `"sun"`) share one body. `default` runs when
nothing matches and can go anywhere, though last is usual.

### Return instead of break

```javascript
function dayName(n) {
  switch (n) {
    case 0:
      return "Sun";
    case 6:
      return "Sat";
    default:
      return "weekday";
  }
}
console.log(dayName(6), dayName(3)); // Sat weekday
```

### Ranges with switch (true)

```javascript
function grade(score) {
  switch (true) {
    case score >= 90:
      return "A";
    case score >= 80:
      return "B";
    default:
      return "C";
  }
}
console.log(grade(85)); // B
```

### Variables inside a case

Wrap the case body in braces so each case gets its own scope.

```javascript
const op = "sub";
const a = 7;
const b = 2;
switch (op) {
  case "add": {
    const result = a + b;
    console.log(result);
    break;
  }
  case "sub": {
    const result = a - b;
    console.log(result); // 5
    break;
  }
}
```

### Use it in a loop

```javascript
const moves = ["up", "up", "left", "jump", "down"];
let x = 0;
let y = 0;
for (const move of moves) {
  switch (move) {
    case "up":
      y++;
      break;
    case "down":
      y--;
      break;
    case "left":
      x--;
      break;
    case "right":
      x++;
      break;
    default:
      console.log(`unknown move: ${move}`); // unknown move: jump
  }
}
console.log(x, y); // -1 1
```

`break` inside a `switch` leaves the `switch`, not the loop. Use `continue`
to skip to the next item, or `return` inside a function to stop.

### Object lookup instead

```javascript
const prices = { apple: 1.5, pear: 2 };
const fruit = "pear";
console.log(prices[fruit] ?? 0); // 2
```

### Gotchas

- A missing `break` runs the next case too. Mark deliberate fall-through with a `// falls through` comment.
- Matching is strict: `switch ("1")` never matches `case 1`. Convert input with `Number()` first.
- `const result` in two cases without braces is a SyntaxError (already declared), because all cases share one scope.
- `break` exits the `switch` only. To leave the surrounding loop, use a label (`outer: for ...` with `break outer`) or a flag.
