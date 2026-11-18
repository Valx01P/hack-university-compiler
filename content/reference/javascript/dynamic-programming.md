# Dynamic Programming

Dynamic programming solves a problem from the answers to its smaller versions, computing each smaller answer once. Write it top-down as a recursion with a memo (a `Map` from the arguments to the answer), or bottom-up as a table filled in order. Name what one entry means first ("`dp[i]` is the most money from the first `i` houses"), then the recurrence, then the base cases.

### Memo with a Map

```javascript
const memo = new Map();
function fib(n) {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n);
  const result = fib(n - 1) + fib(n - 2);
  memo.set(n, result);
  return result;
}
console.log(fib(50));  // 12586269025, instantly instead of billions of calls
```

### Memo for two arguments: a string key

A Map compares array keys by reference, so join the arguments into one string.

```javascript
const memo = new Map();
function paths(r, c) {  // ways from (0, 0) to (r, c) moving right or down
  if (r === 0 || c === 0) return 1;
  const key = `${r},${c}`;
  if (!memo.has(key)) memo.set(key, paths(r - 1, c) + paths(r, c - 1));
  return memo.get(key);
}
console.log(paths(2, 2), paths(16, 16));  // 6 601080390
```

### 1D table, then two variables

```javascript
function climbStairs(n) {  // 1 or 2 steps at a time
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  dp[1] = 1;
  for (let i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
  return dp[n];
}
console.log(climbStairs(5));  // 8

let prev = 1;  // only the last two entries matter, so keep just those
let curr = 1;
for (let i = 2; i <= 5; i++) [prev, curr] = [curr, prev + curr];
console.log(curr);  // 8
```

### Take or skip: house robber

```javascript
const houses = [2, 7, 9, 3, 1];
let skip = 0;  // best so far if this house is skipped
let take = 0;  // best so far if this house is robbed
for (const money of houses) {
  [skip, take] = [Math.max(skip, take), skip + money];
}
console.log(Math.max(skip, take));  // 12: 2 + 9 + 1
```

### Fewest coins: Infinity for impossible

```javascript
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);  // dp[a]: fewest coins to make a
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1);
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}
console.log(coinChange([1, 2, 5], 11), coinChange([2], 3));  // 3 -1

const ways = new Array(6).fill(0);  // how many ways, order not counted
ways[0] = 1;
for (const coin of [1, 2, 5]) {
  for (let a = coin; a <= 5; a++) ways[a] += ways[a - coin];
}
console.log(ways[5]);  // 4
```

### 2D tables: build every row on its own

```javascript
const rows = 3;
const cols = 4;
const good = Array.from({ length: rows }, () => new Array(cols).fill(0));
good[0][0] = 1;
console.log(JSON.stringify(good));  // [[1,0,0,0],[0,0,0,0],[0,0,0,0]]

const bad = new Array(rows).fill(new Array(cols).fill(0));  // one row, shared three times
bad[0][0] = 1;
console.log(JSON.stringify(bad));   // [[1,0,0,0],[1,0,0,0],[1,0,0,0]]
```

### 2D table over a grid: paths around walls

```javascript
const grid = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];  // 1 is a wall
const m = grid.length;
const n = grid[0].length;
const dp = Array.from({ length: m }, () => new Array(n).fill(0));
for (let r = 0; r < m; r++) {
  for (let c = 0; c < n; c++) {
    if (grid[r][c] === 1) continue;  // no way through a wall
    if (r === 0 && c === 0) dp[r][c] = 1;
    else dp[r][c] = (r > 0 ? dp[r - 1][c] : 0) + (c > 0 ? dp[r][c - 1] : 0);  // from above, from the left
  }
}
console.log(dp[m - 1][n - 1]);  // 2
```

### 2D table over two strings: longest common subsequence

`dp[i][j]` is the answer for the first `i` letters of `a` and the first `j` of `b`. An extra row and column of zeros covers the empty prefixes.

```javascript
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1                  // the letters match: extend
        : Math.max(dp[i - 1][j], dp[i][j - 1]); // drop one letter from either
    }
  }
  return dp[a.length][b.length];
}
console.log(lcs("abcde", "ace"), lcs("abc", "def"));  // 3 0
```

### Running best: maximum subarray (Kadane)

```javascript
function maxSubarray(nums) {
  let endingHere = nums[0];
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    endingHere = Math.max(nums[i], endingHere + nums[i]);  // extend the run or start over
    best = Math.max(best, endingHere);
  }
  return best;
}
console.log(maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]));  // 6: 4 - 1 + 2 + 1
console.log(maxSubarray([-3, -1, -2]));                     // -1, start from nums[0], not 0
```

### Big answers: modulo or BigInt

Counts grow fast, and a `Number` is only exact up to `Number.MAX_SAFE_INTEGER` (2^53 - 1). Problems that say "modulo 1e9 + 7" want `%` after every addition. For an exact huge answer, use `BigInt`.

```javascript
const MOD = 1_000_000_007;
let a = 1;
let b = 1;
for (let i = 2; i <= 1000; i++) [a, b] = [b, (a + b) % MOD];
console.log(b);  // 107579939, stair climbs for n = 1000, mod 1e9 + 7

let x = 0n;
let y = 1n;
for (let i = 0; i < 100; i++) [x, y] = [y, x + y];
console.log(x.toString());   // 354224848179261915075, the exact 100th Fibonacci
console.log(2 ** 53 + 1);    // 9007199254740992, a Number already rounded
```

### Setting one up

1. Say in words what `dp[i]` (or `dp[i][j]`) means, like "the fewest coins that make amount i".
2. Write how it follows from smaller entries.
3. Fill in the base cases: `dp[0]`, the first row, the first column.
4. Loop in an order where every entry you read is already filled.
5. Read the answer: `dp[n]`, `dp[m][n]`, or the best over the whole table.

### Gotchas

- `new Array(n).fill(new Array(m).fill(0))` and `Array(n).fill([])` share one inner array across every row. Use `Array.from({ length: n }, () => new Array(m).fill(0))`.
- A memo `Map` keyed by an array (`memo.get([i, j])`) never hits. Key by a string or by `i * cols + j`.
- `(a * b) % MOD` loses precision once `a * b` passes 2^53, which happens for two numbers near 1e9. Use `Number((BigInt(a) * BigInt(b)) % BigInt(MOD))` for products.
- A top-down memo recurses once per state, so 100,000 states in a chain overflow the stack. Fill a table bottom-up instead.
