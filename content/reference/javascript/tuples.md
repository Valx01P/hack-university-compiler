# Tuples and Pairs

JavaScript has no tuple type. Use a short array like `[name, age]` for a pair and unpack it with destructuring, or an object `{ x, y }` when the fields deserve names.

### Make and unpack

```javascript
const pair = ["ann", 31];
const [name, age] = pair;        // name = 'ann', age = 31
pair[0];                         // 'ann'

const point = { x: 3, y: 4 };    // named fields read better past two
const { x, y } = point;          // x = 3, y = 4
```

Skipping, defaults, rest, and swapping with destructuring are in Multiple Assignment. Returning a pair from a function is in Functions.

### Lists of pairs

```javascript
const people = [["bob", 25], ["ann", 31], ["cy", 25]];

for (const [name, age] of people) {
  console.log(`${name}: ${age}`);   // bob: 25, ann: 31, cy: 25
}

// by age, then by name
people.sort((p, q) => p[1] - q[1] || p[0].localeCompare(q[0]));
// [ [ 'bob', 25 ], [ 'cy', 25 ], [ 'ann', 31 ] ]

const names = people.map(([name]) => name);   // [ 'bob', 'cy', 'ann' ]
const ages = new Map(people);                 // pairs are what Map takes
```

### Index and value pairs, zip

```javascript
for (const [i, ch] of ["x", "y"].entries()) {
  console.log(i, ch);               // 0 x, then 1 y
}

const keys = ["a", "b"];
const vals = [1, 2];
const zipped = keys.map((k, i) => [k, vals[i]]);  // [ [ 'a', 1 ], [ 'b', 2 ] ]
```

### Read-only

```javascript
const p = Object.freeze([1, 2]);
p[0] = 9;      // silently ignored (throws in strict mode)
p.push(3);     // TypeError: Cannot add property 2, object is not extensible
```

### Pairs as keys

```javascript
const seen = new Set();
seen.add(`${3},${4}`);                       // store the pair as a string
seen.has(`${3},${4}`);                       // true
const [r, c] = "3,4".split(",").map(Number); // back to numbers: r = 3, c = 4
```

### Gotchas

- `[1, 2] === [1, 2]` is `false`. Arrays compare by reference, so a pair never works as a Map key or Set member. Use a string like `"3,4"`.
- `const` stops reassignment, not changes: `pair[0] = "x"` still works. Use `Object.freeze` if you need it fixed.
- The comparator for `sort` must return a number. `p[1] - q[1] || ...` breaks ties with the next field.
