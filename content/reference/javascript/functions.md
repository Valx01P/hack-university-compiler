# Functions

JavaScript has three common ways to write a function: a declaration, a function expression, and an arrow function. Functions are values, so you can store them in variables, pass them in, and return them. Parameter and return types are never declared.

### Declare

```javascript
function add(a, b) {
  return a + b;
}

const sub = function (a, b) {
  return a - b;
};

const mul = (a, b) => a * b;          // arrow, implicit return
const square = (x) => x * x;          // one parameter
const hello = () => "hi";             // no parameters
const point = () => ({ x: 1, y: 2 }); // wrap an object literal in ( )
const clamp = (x, lo, hi) => {        // block body needs return
  if (x < lo) return lo;
  return x > hi ? hi : x;
};

console.log(add(2, 3), sub(5, 1), mul(3, 4), clamp(15, 0, 10)); // 5 4 12 10
```

### Default and rest parameters

```javascript
function greet(name = "World", punct = "!") {
  return `Hello, ${name}${punct}`;
}
greet();             // 'Hello, World!'
greet("Ada", "?");   // 'Hello, Ada?'
greet(undefined, "."); // 'Hello, World.'

function sum(...nums) {    // rest: all remaining args as an array
  return nums.reduce((total, n) => total + n, 0);
}
sum(1, 2, 3);       // 6
const list = [4, 5, 6];
sum(...list);       // 15 (spread an array into arguments)
```

### Missing and extra arguments

```javascript
function show(a, b) {
  console.log(a, b);
}
show(1);       // 1 undefined (missing args are undefined)
show(1, 2, 3); // 1 2 (extras are ignored)
```

### Return several values

```javascript
function minMax(arr) {
  return [Math.min(...arr), Math.max(...arr)];
}
const [lo, hi] = minMax([3, 9, 1]);
console.log(lo, hi); // 1 9

function stats(arr) {
  const total = arr.reduce((s, x) => s + x, 0);
  return { total, mean: total / arr.length };
}
const { total, mean } = stats([2, 4, 6]);
console.log(total, mean); // 12 4
```

### Pass functions around

```javascript
function applyTwice(fn, x) {
  return fn(fn(x));
}
console.log(applyTwice((n) => n + 3, 1)); // 7

const nums = [5, 2, 8];
nums.sort((a, b) => a - b);                // callback decides the order
console.log(nums.map((n) => n * 10));      // [ 20, 50, 80 ]
```

### Closures

```javascript
function makeCounter() {
  let count = 0; // stays alive inside the returned function
  return () => ++count;
}
const next = makeCounter();
next();
next();
console.log(next()); // 3
```

### Recursion

```javascript
function factorial(n) {
  if (n <= 1) return 1; // base case
  return n * factorial(n - 1);
}
console.log(factorial(5)); // 120

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
console.log(fib(10)); // 55
```

### Objects and arrays are passed by reference

```javascript
function addItem(arr) {
  arr.push("new"); // changes the caller's array
}
function reassign(arr) {
  arr = []; // only changes the local name
}
const items = ["old"];
addItem(items);
reassign(items);
console.log(items); // [ 'old', 'new' ]
```

### Use it in a loop

```javascript
function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false; // return exits the whole function
  }
  return true;
}

const primes = [];
for (let n = 1; n <= 20; n++) {
  if (isPrime(n)) primes.push(n);
}
console.log(primes.join(" ")); // 2 3 5 7 11 13 17 19
```

| Form | Hoisted? | Notes |
| --- | --- | --- |
| `function f() {}` | yes, call it before the line | has its own `this` and `arguments` |
| `const f = function () {};` | no | same as above, assigned to a name |
| `const f = () => x;` | no | short, no own `this`, best for callbacks |

### Gotchas

- A function with no `return` returns `undefined`. Arrow functions with `{ }` need an explicit `return` too.
- `() => { x: 1 }` is a block with a label, not an object. Write `() => ({ x: 1 })`.
- Arrow and `const` functions can't be called before their line (`ReferenceError`). Declarations can.
- Default values apply to `undefined` only: `greet(null)` gives `"Hello, null!"`.
