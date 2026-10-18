# Looping Over Strings

A string is iterable, so `for...of` gives you each character as a one-letter string. Use an index loop when you need positions or neighbors. Characters are read-only, so build a new string as you go.

### By index

```javascript
const s = "code";
for (let i = 0; i < s.length; i++) {
  console.log(i, s[i]); // 0 c, 1 o, 2 d, 3 e
}
```

### By character (for...of)

```javascript
for (const ch of "code") {
  console.log(ch); // c o d e
}
```

### Backwards

```javascript
const s = "code";
let rev = "";
for (let i = s.length - 1; i >= 0; i--) {
  rev += s[i];
}
console.log(rev); // edoc
```

### while loop

```javascript
const s = "aaab";
let i = 0;
while (i < s.length && s[i] === "a") {
  i++;
}
console.log(i); // 3 (leading a's)
```

### Count and classify characters

```javascript
const text = "Hello World 42!";
let vowels = 0;
let digits = 0;
let upper = 0;
let letters = 0;
for (const ch of text) {
  if ("aeiouAEIOU".includes(ch)) vowels++;
  if (ch >= "0" && ch <= "9") digits++;
  if (ch >= "A" && ch <= "Z") upper++;
  if (/[a-z]/i.test(ch)) letters++;
}
console.log(vowels, digits, upper, letters); // 3 2 2 10
```

### Character frequency

```javascript
const counts = {};
for (const ch of "banana") {
  counts[ch] = (counts[ch] || 0) + 1;
}
console.log(JSON.stringify(counts)); // {"b":1,"a":3,"n":2}

const freq = new Map();
for (const ch of "banana") {
  freq.set(ch, (freq.get(ch) ?? 0) + 1);
}
console.log(freq.get("a")); // 3
```

### Build a new string

```javascript
const s = "Hello World";
let swapped = "";
for (const ch of s) {
  swapped += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
}
console.log(swapped); // hELLO wORLD

const noSpaces = [...s].filter((ch) => ch !== " ").join("");
console.log(noSpaces); // HelloWorld
```

### Shift letters with char codes

```javascript
const shift = 3;
let secret = "";
for (const ch of "xyz abc") {
  if (ch >= "a" && ch <= "z") {
    const code = (ch.charCodeAt(0) - 97 + shift) % 26 + 97; // 97 is "a"
    secret += String.fromCharCode(code);
  } else {
    secret += ch;
  }
}
console.log(secret); // abc def
```

### Neighbors: compare each character with the next

```javascript
const s = "aaabccdd";
let runs = 1;
for (let i = 1; i < s.length; i++) {
  if (s[i] !== s[i - 1]) runs++;
}
console.log(runs); // 4 (aaa, b, cc, dd)
```

### Words and lines

```javascript
const sentence = "the quick brown fox";
for (const word of sentence.split(" ")) {
  console.log(word, word.length); // the 3, quick 5, ...
}

const text = "line 1\nline 2";
for (const [n, line] of text.split("\n").entries()) {
  console.log(`${n + 1}: ${line}`); // 1: line 1, 2: line 2
}
```

| Want | Write |
| --- | --- |
| each character | `for (const ch of s)` |
| index and character | `for (let i = 0; i < s.length; i++)` with `s[i]` |
| array of characters | `[...s]` or `s.split("")` |
| is it a digit? | `ch >= "0" && ch <= "9"` |
| is it a letter? | `/[a-z]/i.test(ch)` |
| character code | `ch.charCodeAt(0)` and back with `String.fromCharCode(n)` |

### Gotchas

- `s[i] = "x"` silently does nothing (strings are immutable). Build a new string or edit an array of characters and `join("")`.
- `for...in` on a string gives indexes as strings. Use `for...of` for characters.
- `s.split("")` and `s[i]` break emoji into two halves. `for...of` and `[...s]` keep them whole.
- Comparing `ch >= "a"` compares character codes, so it works only for single characters, not whole words.
