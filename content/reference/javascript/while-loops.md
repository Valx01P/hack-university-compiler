# While Loops

`while` checks its condition before each pass, so it may run zero times. `do...while` checks after, so the body always runs at least once. Use them when you don't know the number of passes up front.

### while

```javascript
let n = 1;
while (n < 100) {
  n *= 2;
}
console.log(n); // 128
```

### do...while

```javascript
let tries = 0;
do {
  tries++;
} while (tries < 3);
console.log(tries); // 3

const k = 10;
do {
  console.log("runs once"); // printed even though k < 5 is false
} while (k < 5);
```

### Loop forever, break when done

```javascript
let x = 6;
let steps = 0;
while (true) {
  if (x === 1) break;
  x = x % 2 === 0 ? x / 2 : 3 * x + 1;
  steps++;
}
console.log(steps); // 8
```

### Peel off digits

```javascript
let num = 4096;
let digitSum = 0;
while (num > 0) {
  digitSum += num % 10;
  num = Math.floor(num / 10); // / alone gives 409.6
}
console.log(digitSum); // 19
```

### Two pointers

```javascript
const word = "racecar";
let lo = 0;
let hi = word.length - 1;
let isPalindrome = true;
while (lo < hi) {
  if (word[lo] !== word[hi]) {
    isPalindrome = false;
    break;
  }
  lo++;
  hi--;
}
console.log(isPalindrome); // true
```

### Drain a stack or queue

```javascript
const stack = [1, 2, 3];
while (stack.length > 0) {
  console.log(stack.pop()); // 3 2 1
}

const queue = ["a", "b"];
while (queue.length) {
  const item = queue.shift(); // take from the front
  console.log(item);          // a b
}
```

### Search until found

```javascript
const nums = [4, 9, 15, 22];
let i = 0;
while (i < nums.length && nums[i] % 5 !== 0) {
  i++;
}
console.log(i < nums.length ? `found ${nums[i]} at ${i}` : "none"); // found 15 at 2
```

| Form | Checks the condition |
| --- | --- |
| `while (cond) { }` | before each pass, may run 0 times |
| `do { } while (cond);` | after each pass, runs at least once |
| `while (true) { if (done) break; }` | wherever you put the `break` |

`break` and `continue` work exactly as in `for` loops, including labels.

### Gotchas

- Forget to change the loop variable and the loop never ends. The sandbox kills the program after a time limit.
- `/` is float division. `while (n > 0) n = n / 10` runs hundreds of times before reaching 0. Use `Math.floor(n / 10)`.
- `while (x)` also stops on `0`, `""`, and `NaN`. Write the comparison you mean, like `x !== null`.
- `continue` in a `while` skips the rest of the body, including your `i++` at the bottom. Update the counter before it.
