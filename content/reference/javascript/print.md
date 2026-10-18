# Printing

`console.log` prints its arguments separated by spaces and ends the line. It is
global, so there is nothing to `require`.

### Print a line

```javascript
console.log("Hello, world!"); // Hello, world!
console.log("a", 1, true);    // a 1 true
console.log();                // (empty line)
```

### Print without a newline

```javascript
process.stdout.write("Loading");
process.stdout.write("...");
process.stdout.write(`${100}%\n`);
// Loading...100%
```

### Escapes and multi-line text

```javascript
console.log("name\tage");        // name    age (\t is a tab)
console.log("quote: \"hi\"");    // quote: "hi"
console.log('it\'s', "C:\\dir"); // it's C:\dir
console.log(`line 1
line 2`);
// line 1
// line 2
```

### Arrays and objects

```javascript
console.log([1, 2, 3]);                  // [ 1, 2, 3 ]
console.log({ a: 1, b: "x" });           // { a: 1, b: 'x' }
console.log([1, 2, 3].join(", "));       // 1, 2, 3
console.log(JSON.stringify({ a: [1] })); // {"a":[1]}
console.log(JSON.stringify({ a: 1, b: 2 }, null, 2));
// {
//   "a": 1,
//   "b": 2
// }
```

### Use it in a loop

```javascript
for (let i = 1; i <= 3; i++) {
  console.log(`Line ${i}`);
}
// Line 1
// Line 2
// Line 3

const squares = [];
for (let i = 1; i <= 5; i++) {
  squares.push(i * i);
}
console.log(squares.join(" ")); // 1 4 9 16 25
```

### Console calls

| Call | Does |
| --- | --- |
| `console.log(a, b)` | prints to stdout, space separated, newline at the end |
| `process.stdout.write(s)` | prints a string with no newline |
| `console.error(x)` | prints to stderr (not part of the program's output) |
| `console.log("%s is %d", s, n)` | printf-style placeholders |
| `console.dir(obj, { depth: null })` | prints a deeply nested object in full |

### Gotchas

- `process.stdout.write` only takes strings: `process.stdout.write(42)` throws a TypeError. Wrap numbers in `String()` or a template literal.
- Arrays with more than 6 items wrap across several lines in `console.log`. Use `arr.join(" ")` for one tidy line.
- Objects nested more than two levels deep print as `[Object]`. Use `JSON.stringify` or `console.dir(obj, { depth: null })`.
- Strings inside arrays and objects print with single quotes (`[ 'a' ]`), but a string on its own prints bare (`a`).
