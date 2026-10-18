# Strings

Strings are immutable: every method returns a new string. Single quotes, double quotes, and backticks all work, and backticks (template literals) add `${}` interpolation and multi-line text. No import needed.

### Create

```javascript
const a = "double";
const b = 'single';
const name = "Ada";
const greeting = `Hi, ${name}! 2 + 2 = ${2 + 2}`; // 'Hi, Ada! 2 + 2 = 4'
const lines = `line one
line two`;                                          // keeps the newline
const escaped = "tab\there, quote \" and newline\n";
const dashes = "-".repeat(5);                       // '-----'
```

### Access

```javascript
const s = "hello";
s.length;        // 5
s[0];            // 'h'
s.at(-1);        // 'o' (negative counts from the end)
s[10];           // undefined, no error
s.slice(1, 3);   // 'el' (end excluded)
s.slice(-3);     // 'llo'
s.charCodeAt(0); // 104
String.fromCharCode(105); // 'i'
```

### Search

```javascript
const s = "banana split";
s.includes("nan");     // true
s.startsWith("ban");   // true
s.endsWith("split");   // true
s.indexOf("a");        // 1 (-1 when missing)
s.lastIndexOf("a");    // 5
s.indexOf("a", 2);     // 3 (start looking at index 2)
/\d/.test(s);          // false (regex test: any digit?)
"a1b22".match(/\d+/g); // [ '1', '22' ] (every match, or null)
```

### Change (returns a new string)

```javascript
const s = "  Hello World  ";
s.trim();                 // 'Hello World'
s.trimStart();            // 'Hello World  '
s.toUpperCase();          // '  HELLO WORLD  '
s.toLowerCase();          // '  hello world  '
"cat".replace("a", "u");  // 'cut' (first match only)
"a-b-c".replaceAll("-", "+"); // 'a+b+c'
"a-b-c".replace(/-/g, "");    // 'abc' (regex with g flag)
"7".padStart(3, "0");     // '007'
"ab".padEnd(4, ".");      // 'ab..'
```

### Split and join

```javascript
"a,b,c".split(",");          // [ 'a', 'b', 'c' ]
"hello".split("");           // [ 'h', 'e', 'l', 'l', 'o' ]
"one  two".split(" ");       // [ 'one', '', 'two' ]
"one  two".split(/\s+/);     // [ 'one', 'two' ]
["x", "y", "z"].join("-");   // 'x-y-z'
[..."hey"].reverse().join(""); // 'yeh' (reverse a string)
```

### Compare

```javascript
"abc" === "abc";               // true (compares content)
"apple" < "banana";            // true (character by character)
"Zebra" < "apple";             // true (uppercase sorts first)
"a".localeCompare("b");        // -1 (use in sort callbacks)
"Hi".toLowerCase() === "hi";   // true (case-insensitive check)
```

String to number and back (`Number`, `parseInt`, `String`) is in Variables and Types.

| Call | Does |
| --- | --- |
| `s.length` | number of characters (UTF-16 units) |
| `s.slice(i, j)` | part from `i` up to `j` (negatives ok) |
| `s.includes(t)` / `s.indexOf(t)` | contains? / where (`-1` if not) |
| `s.split(sep)` / `arr.join(sep)` | string to array / array to string |
| `s.trim()` | strip spaces at both ends |
| `s.toUpperCase()` / `s.toLowerCase()` | change case |
| `s.replace(a, b)` / `s.replaceAll(a, b)` | first / every match |
| `s.match(/re/g)` | array of every regex match, or `null` |
| `s.repeat(n)` | `n` copies joined |
| `s.padStart(n, ch)` | left-pad to width `n` |
| `s.charCodeAt(i)` / `String.fromCharCode(n)` | char to number / number to char |

### Use it in a loop

```javascript
const words = ["red", "green", "blue"];
let out = "";
for (const w of words) {
  out += w[0].toUpperCase() + w.slice(1) + " ";
}
console.log(out.trim()); // Red Green Blue
```

### Gotchas

- Strings can't be changed in place: `s[0] = "X"` does nothing. Build a new string, like `"X" + s.slice(1)`.
- Strings have no `reverse` or `sort`. Spread into an array first: `[...s].sort().join("")`.
- `replace` with a plain string changes only the first match. Use `replaceAll` or a regex with `/g`.
- `length` and `s[i]` count UTF-16 units, so an emoji has length 2. `[...s]` splits by real characters.
