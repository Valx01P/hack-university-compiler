# Errors and Exceptions

JavaScript uses `try` / `catch` / `finally` and `throw`. Any value can be thrown, but always throw an `Error` (or a subclass) so you get a `message` and a stack trace. An uncaught error prints the stack to stderr and exits with code 1.

### Catch

```javascript
try {
  const data = JSON.parse("{bad json");
  console.log(data);              // skipped
} catch (err) {
  console.log(err.name);          // SyntaxError
  console.log(err.message);       // Expected property name or '}' in JSON at position 1
} finally {
  console.log("always runs");     // runs on success, on error, and after return
}

try {
  JSON.parse("{");
} catch {                         // leave out (err) when you do not need it
  console.log("bad input");
}
```

### Throw

```javascript
function divide(a, b) {
  if (b === 0) throw new RangeError("division by zero");
  return a / b;                   // without the check, 1 / 0 is Infinity, not an error
}

try {
  divide(1, 0);
} catch (err) {
  console.log(`${err.name}: ${err.message}`);   // RangeError: division by zero
}
```

### Built-in error types

| Type | Thrown when |
| --- | --- |
| `Error` | the general one, use it or subclass it |
| `TypeError` | wrong kind of value: `undefined.name`, calling a non-function, assigning to a `const` |
| `ReferenceError` | a variable that does not exist |
| `RangeError` | a number out of range: `(5).toFixed(200)`, `new Array(-1)` |
| `SyntaxError` | `JSON.parse` on bad text |

### Check the type

```javascript
try {
  const user = undefined;
  console.log(user.name);
} catch (err) {
  if (err instanceof TypeError) {
    console.log("type problem:", err.message); // type problem: Cannot read properties of undefined (reading 'name')
  } else {
    throw err;                    // rethrow what you cannot handle
  }
}
```

### Custom errors

```javascript
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "ValidationError";   // shows in the stack and String(err)
    this.field = field;
  }
}

try {
  throw new ValidationError("age", "age must be positive");
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(`${err.field}: ${err.message}`);   // age: age must be positive
  } else {
    throw err;
  }
}
```

### Keep going in a loop

```javascript
const inputs = ["4", "x", "-2", "10"];
const valid = [];
for (const s of inputs) {
  try {
    const n = Number(s);
    if (Number.isNaN(n)) throw new TypeError(`not a number: ${s}`);
    if (n < 0) throw new RangeError(`negative: ${n}`);
    valid.push(n);
  } catch (err) {
    console.log(`skipped (${err.message})`);
  }
}
// skipped (not a number: x)
// skipped (negative: -2)
valid;   // [ 4, 10 ]
```

### Wrap with a cause

```javascript
const text = "{bad json";
try {
  JSON.parse(text);
} catch (err) {
  throw new Error("config is broken", { cause: err });   // err.cause is the original
}
```

### Async code

```javascript
async function load() {
  throw new Error("network down");
}

async function main() {
  try {
    await load();                 // await makes the rejection throw here
  } catch (err) {
    console.log("caught", err.message);
  }
  load().catch((err) => console.log("also caught", err.message));
}
main();
```

### Gotchas

- `try` cannot catch an error thrown later in a callback: `try { setTimeout(() => { throw e }) } catch {}` still crashes. Catch inside the callback, or use `await`.
- Calling an `async` function without `await` or `.catch` turns its error into an unhandled rejection that ends the program.
- `throw "oops"` throws a plain string, so `err.message` is `undefined`. Throw `new Error("oops")`.
- An empty `catch {}` hides bugs. At least log the error, and rethrow the ones you did not expect.
