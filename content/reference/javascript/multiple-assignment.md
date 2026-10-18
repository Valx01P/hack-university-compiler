# Multiple Assignment

Declare several names on one line with commas, or unpack an array or object in
one step with destructuring. Swapping two variables is a one-liner.

### Several on one line

```javascript
let a = 1, b = 2, c = 3;
const width = 10, height = 4;
console.log(a + b + c, width * height); // 6 40
```

### Same value to several

```javascript
let x, y, z;
x = y = z = 0;
console.log(x, y, z); // 0 0 0
```

### Unpack an array

```javascript
const [first, second] = [10, 20];
const [head, ...rest] = [1, 2, 3, 4];
const [, , third] = ["a", "b", "c"];
const [p = 5, q = 7] = [1];
console.log(first, second); // 10 20
console.log(head, rest);    // 1 [ 2, 3, 4 ]
console.log(third);         // c
console.log(p, q);          // 1 7
```

### Unpack an object

```javascript
const point = { x: 3, y: 4 };
const { x, y } = point;
const { x: px, z = 0 } = point; // rename x to px, default for z
console.log(x, y, px, z);       // 3 4 3 0

let w, h;
({ w, h } = { w: 8, h: 2 });    // existing variables need the parentheses
console.log(w, h);              // 8 2
```

### Swap

```javascript
let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b); // 2 1
```

Returning several values from a function is in Functions.

### Use it in a loop

```javascript
const people = [["Ada", 36], ["Alan", 41]];
for (const [name, age] of people) {
  console.log(`${name} is ${age}`);
}
// Ada is 36
// Alan is 41

const scores = { ada: 90, alan: 85 };
for (const [key, value] of Object.entries(scores)) {
  console.log(key, value);
}
// ada 90
// alan 85

let a = 0, b = 1;
for (let i = 0; i < 10; i++) {
  [a, b] = [b, a + b];
}
console.log(a); // 55
```

### Gotchas

- `let a, b = 0` only sets `b`. `a` is `undefined`.
- `const a = b = 0` does not declare `b`. It makes `b` an accidental global. Declare each name.
- A line that starts with `[` or `(` joins the line above when that line has no semicolon: `let b = 2` then `[a, b] = [b, a]` becomes `2[a, b] = ...`. End the line before a swap with `;`.
- Destructuring `null` or `undefined` throws a TypeError: `const { x } = null`.
