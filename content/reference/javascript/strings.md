# Strings

Strings are immutable: every method returns a new string. Single quotes, double quotes, and backticks all work, and backticks (template literals) add `${}` interpolation and multi-line text. No import needed.

### Create

```javascript
const a = "double";
const b = 'single';
const name = "Ada";
console.log(`Hi, ${name}! 2 + 2 = ${2 + 2}`);       // Hi, Ada! 2 + 2 = 4
const lines = `line one
line two`;                                          // keeps the newline
const escaped = "tab\there, quote \" and newline\n";
console.log("-".repeat(5));                         // -----
```

### Access

```javascript
const s = "hello";
console.log(s.length);                 // 5
console.log(s[0]);                     // h
console.log(s.at(-1));                 // o (negative counts from the end)
console.log(s[10]);                    // undefined, no error
console.log(s.slice(1, 3));            // el (end excluded)
console.log(s.slice(-3));              // llo
console.log(s.charCodeAt(0));          // 104
console.log(String.fromCharCode(105)); // i
```

### Search

```javascript
const s = "banana split";
console.log(s.includes("nan"));     // true
console.log(s.startsWith("ban"));   // true
console.log(s.endsWith("split"));   // true
console.log(s.indexOf("a"));        // 1 (-1 when missing)
console.log(s.lastIndexOf("a"));    // 5
console.log(s.indexOf("a", 2));     // 3 (start looking at index 2)
console.log(/\d/.test(s));          // false (regex test: any digit?)
console.log("a1b22".match(/\d+/g)); // [ '1', '22' ] (every match, or null)
```

### Change (returns a new string)

```javascript
const s = "  Hello World  ";
console.log(`[${s.trim()}]`);               // [Hello World]
console.log(`[${s.trimStart()}]`);          // [Hello World  ]
console.log(`[${s.toUpperCase()}]`);        // [  HELLO WORLD  ]
console.log(`[${s.toLowerCase()}]`);        // [  hello world  ]
console.log("cat".replace("a", "u"));       // cut (first match only)
console.log("a-b-c".replaceAll("-", "+"));  // a+b+c
console.log("a-b-c".replace(/-/g, ""));     // abc (regex with g flag)
console.log("7".padStart(3, "0"));          // 007
console.log("ab".padEnd(4, "."));           // ab..
```

### Split and join

```javascript
console.log("a,b,c".split(","));             // [ 'a', 'b', 'c' ]
console.log("hello".split(""));              // [ 'h', 'e', 'l', 'l', 'o' ]
console.log("one  two".split(" "));          // [ 'one', '', 'two' ]
console.log("one  two".split(/\s+/));        // [ 'one', 'two' ]
console.log(["x", "y", "z"].join("-"));      // x-y-z
console.log([..."hey"].reverse().join(""));  // yeh (reverse a string)
```

### Compare

```javascript
console.log("abc" === "abc");               // true (compares content)
console.log("apple" < "banana");            // true (character by character)
console.log("Zebra" < "apple");             // true (uppercase sorts first)
console.log("a".localeCompare("b"));        // -1 (use in sort callbacks)
console.log("Hi".toLowerCase() === "hi");   // true (case-insensitive check)
```

String to number and back (`Number`, `parseInt`, `String`) is in Variables and Types.

### Letters as numbers

`"a"` is 97 and `"A"` is 65, so `charCodeAt(0) - 97` turns a lowercase letter into 0 to 25.

```javascript
console.log("d".charCodeAt(0) - 97);         // 3, the letter's index
console.log(String.fromCharCode(97 + 25));   // z
console.log("7".charCodeAt(0) - 48, +"7");   // 7 7, a digit's value two ways
const shift = (ch, k) => String.fromCharCode(((ch.charCodeAt(0) - 97 + k) % 26 + 26) % 26 + 97);
console.log(shift("y", 3), shift("b", -3));  // b y, wrapping around

const counts = new Array(26).fill(0);        // a letter counter without a Map
for (const ch of "banana") counts[ch.charCodeAt(0) - 97]++;
console.log(counts[0], counts[1], counts[13]);  // 3 1 2
```

### Test a character

```javascript
const isLetter = (ch) => /^[a-z]$/i.test(ch);
const isDigit = (ch) => ch >= "0" && ch <= "9";
const isAlnum = (ch) => /^[a-z0-9]$/i.test(ch);
console.log(isLetter("Q"), isDigit("7"), isAlnum("!"));      // true true false
console.log("Q" === "Q".toUpperCase(), "q" !== "q".toUpperCase());  // true true, uppercase or not
console.log(" \t".trim() === "");                            // true, only whitespace
```

### Build a string

`+=` in a loop is fast in Node. Collect pieces in an array when you build by index, in reverse, or with a separator, then `join` once.

```javascript
let out = "";
for (const [ch, n] of [["a", 3], ["b", 1], ["c", 2]]) out += n > 1 ? ch + n : ch;
console.log(out);                // a3bc2

const parts = [];
for (let i = 5; i >= 1; i--) parts.push(i);
console.log(parts.join(" > "));  // 5 > 4 > 3 > 2 > 1
const chars = [..."hello"];
chars[0] = "j";                  // change a copy, then join it back
console.log(chars.join(""));     // jello
```

### Palindrome and anagram checks

```javascript
const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const isPalindrome = (s) => {
  const t = clean(s);
  return t === [...t].reverse().join("");
};
console.log(isPalindrome("Race car!"), isPalindrome("Rocket"));  // true false

const sortKey = (w) => [...w].sort().join("");
console.log(sortKey("listen") === sortKey("silent"));             // true, O(n log n)
function isAnagram(a, b) {                                        // O(n) with counts
  if (a.length !== b.length) return false;
  const counts = new Array(26).fill(0);
  for (let i = 0; i < a.length; i++) {
    counts[a.charCodeAt(i) - 97]++;
    counts[b.charCodeAt(i) - 97]--;
  }
  return counts.every((c) => c === 0);
}
console.log(isAnagram("rat", "tar"), isAnagram("rat", "car"));    // true false
```


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
