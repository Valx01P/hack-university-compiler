# Recursion and Backtracking

A recursive function calls itself on a smaller input and stops at a base case. Backtracking is recursion that builds a choice step by step: choose, recurse, then undo the choice, so one `path` array serves every branch. Node allows about 10,000 nested calls here, which is plenty for subsets and permutations, but not for walking a 100,000-node chain.

### Base case and recursive case

```javascript
function factorial(n) {
  if (n <= 1) return 1;         // base case: stop here
  return n * factorial(n - 1);  // a smaller problem
}
console.log(factorial(5));  // 120

const power = (x, n) => (n === 0 ? 1 : n % 2 === 0 ? power(x * x, n / 2) : x * power(x, n - 1));
console.log(power(2, 10));  // 1024, in O(log n) calls
```

### A helper that carries an index

Pass an index instead of slicing, so no copies are made.

```javascript
function sum(nums, i = 0) {
  if (i === nums.length) return 0;
  return nums[i] + sum(nums, i + 1);
}
console.log(sum([4, 8, 15]));  // 27

function isPal(s, lo = 0, hi = s.length - 1) {
  if (lo >= hi) return true;
  return s[lo] === s[hi] && isPal(s, lo + 1, hi - 1);
}
console.log(isPal("racecar"), isPal("rocket"));  // true false
```

### Subsets: take it or leave it

```javascript
function subsets(nums) {
  const out = [];
  const path = [];
  function go(i) {
    if (i === nums.length) {
      out.push([...path]);  // copy it: path keeps changing
      return;
    }
    path.push(nums[i]);     // take nums[i]
    go(i + 1);
    path.pop();             // undo, then leave it
    go(i + 1);
  }
  go(0);
  return out;
}
console.log(JSON.stringify(subsets([1, 2, 3])));  // [[1,2,3],[1,2],[1,3],[1],[2,3],[2],[3],[]]
```

### Combinations: a start index

Each level picks one of the numbers after the last pick, so `[1, 2]` and `[2, 1]` never both appear.

```javascript
function combine(n, k) {
  const out = [];
  const path = [];
  function go(start) {
    if (path.length === k) {
      out.push([...path]);
      return;
    }
    for (let x = start; x <= n; x++) {
      path.push(x);
      go(x + 1);
      path.pop();
    }
  }
  go(1);
  return out;
}
console.log(JSON.stringify(combine(4, 2)));  // [[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]
```

### Permutations: a used array

```javascript
function permutations(nums) {
  const out = [];
  const path = [];
  const used = new Array(nums.length).fill(false);
  function go() {
    if (path.length === nums.length) {
      out.push(path.join(""));
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(nums[i]);
      go();
      path.pop();
      used[i] = false;
    }
  }
  go();
  return out;
}
console.log(permutations([1, 2, 3]).join(" "));  // 123 132 213 231 312 321, sorted input gives sorted output
```

### Combination sum: reuse and a running total

Recurse with the same index to reuse a number, and stop once the total passes the target. Sorting first lets the loop `break` early.

```javascript
function combinationSum(candidates, target) {
  const nums = candidates.toSorted((a, b) => a - b);
  const out = [];
  const path = [];
  function go(start, remaining) {
    if (remaining === 0) {
      out.push([...path]);
      return;
    }
    for (let i = start; i < nums.length; i++) {
      if (nums[i] > remaining) break;  // every later number is bigger too
      path.push(nums[i]);
      go(i, remaining - nums[i]);      // i, not i + 1: it can be used again
      path.pop();
    }
  }
  go(0, target);
  return out;
}
console.log(JSON.stringify(combinationSum([3, 2, 6, 7], 7)));  // [[2,2,3],[7]]
```

### N-Queens: columns and diagonals

One queen per row. A column, a `row - col` diagonal, and a `row + col` diagonal can each hold one queen.

```javascript
function nQueens(n) {
  const cols = new Set();
  const diag = new Set();
  const anti = new Set();
  let count = 0;
  function place(row) {
    if (row === n) {
      count++;
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || diag.has(row - c) || anti.has(row + c)) continue;
      cols.add(c);
      diag.add(row - c);
      anti.add(row + c);
      place(row + 1);
      cols.delete(c);
      diag.delete(row - c);
      anti.delete(row + c);
    }
  }
  place(0);
  return count;
}
console.log(nQueens(4), nQueens(8));  // 2 92
```

### Sort the results

Arrays have no built-in order, so sort lists of lists with a compare function: by length, then item by item.

```javascript
const lists = [[2, 3], [1], [], [1, 3], [1, 2], [3], [2]];
lists.sort((a, b) => {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
});
console.log(lists.map((s) => `[${s.join(" ")}]`).join(" "));  // [] [1] [2] [3] [1 2] [1 3] [2 3]
```

### Generate valid strings

```javascript
const out = [];
function parens(open, close, s, n) {
  if (s.length === 2 * n) {
    out.push(s);
    return;
  }
  if (open < n) parens(open + 1, close, s + "(", n);
  if (close < open) parens(open, close + 1, s + ")", n);  // only close what is open
}
parens(0, 0, "", 3);
console.log(out.join(" "));  // ((())) (()()) (())() ()(()) ()()()
```

Building a new string `s + "("` on each call needs no undo step, since every call gets its own string.

### The depth limit

```javascript error
function depth(n) {
  return n === 0 ? 0 : 1 + depth(n - 1);
}
console.log(depth(100000));  // RangeError: Maximum call stack size exceeded
```

### Gotchas

- `out.push(path)` stores the same array every time, so at the end every entry is empty. Push a copy, `[...path]`.
- Forgetting the undo (`path.pop()`, `used[i] = false`) leaks one branch's choice into the next.
- Node stops at about 10,000 nested calls. Turn deep recursion into a loop with an explicit stack.
- Subsets and permutations grow as 2^n and n!, so n above about 20 (subsets) or 10 (permutations) is too slow to list them all.
