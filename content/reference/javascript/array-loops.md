# Looping Over Arrays

Use `for...of` when you only need the values, a counted `for` when you need the index or want to change items, and `forEach` for a short callback. `for...in` is for objects, not arrays.

### Index loop (for)

```javascript
const fruits = ["apple", "banana", "cherry"];
for (let i = 0; i < fruits.length; i++) {
  console.log(i, fruits[i]); // 0 apple, 1 banana, 2 cherry
}
```

### Values (for...of)

```javascript
const fruits = ["apple", "banana", "cherry"];
for (const fruit of fruits) {
  console.log(fruit); // apple banana cherry
}
```

### Index and value together

```javascript
const fruits = ["apple", "banana", "cherry"];
for (const [i, fruit] of fruits.entries()) {
  console.log(`${i}: ${fruit}`); // 0: apple, 1: banana, 2: cherry
}

fruits.forEach((fruit, i) => {
  console.log(i, fruit); // same, but no break
});
```

### while loop with an index

```javascript
const fruits = ["apple", "banana", "cherry"];
let i = 0;
while (i < fruits.length) {
  console.log(fruits[i]); // apple banana cherry
  i++;
}
```

### Change items in place

```javascript
const nums = [1, 2, 3];
for (let i = 0; i < nums.length; i++) {
  nums[i] *= 10;
}
console.log(nums); // [ 10, 20, 30 ]

for (let x of nums) {
  x = 0; // only changes the local copy, nums is untouched
}
console.log(nums); // [ 10, 20, 30 ]
```

### Sum, count, min, max

```javascript
const nums = [4, 7, 1, 9, 2];
let sum = 0;
let evens = 0;
let min = Infinity;
let max = -Infinity;
for (const n of nums) {
  sum += n;
  if (n % 2 === 0) evens++;
  if (n < min) min = n;
  if (n > max) max = n;
}
console.log(sum, evens, min, max); // 23 2 1 9
console.log((sum / nums.length).toFixed(1)); // 4.6
```

### Build a new array

```javascript
const nums = [4, 7, 1, 9, 2];
const big = [];
for (const n of nums) {
  if (n > 3) big.push(n * 2);
}
console.log(big.join(" ")); // 8 14 18

// The same with callbacks
const big2 = nums.filter((n) => n > 3).map((n) => n * 2);
console.log(big2.join(" ")); // 8 14 18
```

### Stop at the first match

```javascript
const nums = [4, 7, 1, 9, 2];
let firstOdd = null;
for (const n of nums) {
  if (n % 2 !== 0) {
    firstOdd = n;
    break;
  }
}
console.log(firstOdd); // 7
```

### Remove while looping: go backwards

```javascript
const nums = [1, 2, 2, 3, 2];
for (let i = nums.length - 1; i >= 0; i--) {
  if (nums[i] === 2) nums.splice(i, 1);
}
console.log(nums); // [ 1, 3 ]
// Or make a new array: nums.filter((n) => n !== 2)
```

| Call | Returns | Can stop early? |
| --- | --- | --- |
| `forEach((x, i) => {})` | `undefined`, just runs the callback | no |
| `map((x, i) => y)` | new array of results | no |
| `filter((x, i) => bool)` | new array of the items that pass | no |
| `reduce((acc, x) => acc2, init)` | one accumulated value | no |
| `some(fn)` / `every(fn)` | `true` or `false` | yes |
| `find(fn)` / `findIndex(fn)` | first match or its index | yes |

### Gotchas

- `forEach` ignores `break` (syntax error) and `return` only ends the current callback. Use `for...of` when you need to stop.
- `for...in` on an array gives string indexes and can include extra properties. Use `for...of` or a counter.
- Removing with `splice` in a forward loop skips the item after each removal. Loop backwards or use `filter`.
- Reassigning the loop variable in `for...of` doesn't change the array. Assign to `arr[i]` instead.
