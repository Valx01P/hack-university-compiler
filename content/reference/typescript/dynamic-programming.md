# Dynamic Programming

Dynamic programming solves a problem from the answers to its smaller versions, computing each smaller answer once. Write it top-down as a recursion with a memo (a `Map` from the arguments to the answer), or bottom-up as a table filled in order. Name what one entry means first ("`dp[i]` is the most money from the first `i` houses"), then the recurrence, then the base cases. Every table read is `number | undefined` here, and the honest `??` default is often a base case itself: no ways, or impossible.

### Memo with a Map

Read with `get` once and compare with `undefined`. A `has` check doesn't narrow the `get` after it, and a truthiness check skips a memoized `0`.

```typescript
const memo = new Map<number, number>();
function fib(n: number): number {
  if (n <= 1) return n;
  const known = memo.get(n);
  if (known !== undefined) return known;
  const result = fib(n - 1) + fib(n - 2);
  memo.set(n, result);
  return result;
}
console.log(fib(50));  // 12586269025, instantly instead of billions of calls
```

### Memo for two arguments: a string key

A `Map` compares array keys by reference, so join the arguments into one string.

```typescript
const memo = new Map<string, number>();
function paths(r: number, c: number): number {  // ways from (0, 0) to (r, c) moving right or down
  if (r === 0 || c === 0) return 1;
  const key = `${r},${c}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  const result = paths(r - 1, c) + paths(r, c - 1);
  memo.set(key, result);
  return result;
}
console.log(paths(2, 2), paths(16, 16));  // 6 601080390
```

### 1D table, then two variables

```typescript
function climbStairs(n: number): number {  // 1 or 2 steps at a time
  const dp = new Array<number>(n + 1).fill(0);
  dp[0] = 1;
  dp[1] = 1;
  for (let i = 2; i <= n; i++) dp[i] = (dp[i - 1] ?? 0) + (dp[i - 2] ?? 0);
  return dp[n] ?? 0;
}
console.log(climbStairs(5));  // 8

let prev = 1;  // only the last two entries matter, so keep just those
let curr = 1;
for (let i = 2; i <= 5; i++) [prev, curr] = [curr, prev + curr];
console.log(curr);  // 8
```

### Take or skip: house robber

```typescript
const houses = [2, 7, 9, 3, 1];
let skip = 0;  // best so far if this house is skipped
let take = 0;  // best so far if this house is robbed
for (const money of houses) {
  [skip, take] = [Math.max(skip, take), skip + money];
}
console.log(Math.max(skip, take));  // 12: 2 + 9 + 1
```

### Fewest coins: Infinity for impossible

`dp[a - coin] ?? Infinity` reads a negative index as impossible too.

```typescript
function coinChange(coins: readonly number[], amount: number): number {
  const dp = new Array<number>(amount + 1).fill(Infinity);  // dp[a]: fewest coins to make a
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      dp[a] = Math.min(dp[a] ?? Infinity, (dp[a - coin] ?? Infinity) + 1);
    }
  }
  const best = dp[amount] ?? Infinity;
  return best === Infinity ? -1 : best;
}
console.log(coinChange([1, 2, 5], 11), coinChange([2], 3));  // 3 -1

const ways = new Array<number>(6).fill(0);  // how many ways, order not counted
ways[0] = 1;
for (const coin of [1, 2, 5]) {
  for (let a = coin; a <= 5; a++) ways[a] = (ways[a] ?? 0) + (ways[a - coin] ?? 0);
}
console.log(ways[5]);  // 4
```

### 2D tables: build every row on its own

`new Array(n)` is `any[]`, so a shared row type-checks as a `number[][]` and nothing warns you.

```typescript
const rows = 3;
const cols = 4;
const good = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
const bad: number[][] = new Array(rows).fill(new Array(cols).fill(0));  // one row, shared three times
for (const table of [good, bad]) {
  const top = table[0];
  if (top !== undefined) top[0] = 1;
}
console.log(JSON.stringify(good));  // [[1,0,0,0],[0,0,0,0],[0,0,0,0]]
console.log(JSON.stringify(bad));   // [[1,0,0,0],[1,0,0,0],[1,0,0,0]]
```

### 2D table over a grid: paths around walls

Push each row as you build it. Above the first row, `above?.[c]` is `undefined`, and left of the first column, `here[c - 1]` is too, so `?? 0` is the edge of the grid: no ways in from outside.

```typescript
const grid = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];  // 1 is a wall
const dp: number[][] = [];
for (const [r, row] of grid.entries()) {
  const above = dp[r - 1];
  const here: number[] = [];
  for (const [c, cell] of row.entries()) {
    if (cell === 1) here.push(0);                  // no way through a wall
    else if (r === 0 && c === 0) here.push(1);
    else here.push((above?.[c] ?? 0) + (here[c - 1] ?? 0));  // from above, from the left
  }
  dp.push(here);
}
console.log(dp.at(-1)?.at(-1));  // 2
```

### 2D table over two strings: longest common subsequence

`dp[i][j]` is the answer for the first `i` letters of `a` and the first `j` of `b`. A first row and column of zeros covers the empty prefixes.

```typescript
function lcs(a: string, b: string): number {
  const dp: number[][] = [new Array<number>(b.length + 1).fill(0)];
  for (let i = 1; i <= a.length; i++) {
    const up = dp[i - 1] ?? [];
    const row = [0];
    for (let j = 1; j <= b.length; j++) {
      row.push(a.charAt(i - 1) === b.charAt(j - 1)
        ? (up[j - 1] ?? 0) + 1                        // the letters match: extend
        : Math.max(up[j] ?? 0, row[j - 1] ?? 0));     // drop one letter from either
    }
    dp.push(row);
  }
  return dp[a.length]?.[b.length] ?? 0;
}
console.log(lcs("abcde", "ace"), lcs("abc", "def"));  // 3 0
```

### Running best: maximum subarray (Kadane)

Starting both at `-Infinity` handles all-negative input and needs no `nums[0]` read.

```typescript
function maxSubarray(nums: readonly number[]): number {
  let endingHere = -Infinity;
  let best = -Infinity;
  for (const x of nums) {
    endingHere = Math.max(x, endingHere + x);  // extend the run or start over
    best = Math.max(best, endingHere);
  }
  return best;
}
console.log(maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]));  // 6: 4 - 1 + 2 + 1
console.log(maxSubarray([-3, -1, -2]));                     // -1, not 0
```

### Big answers: modulo or bigint

A `number` is only exact up to `Number.MAX_SAFE_INTEGER` (2^53 - 1). Problems that say "modulo 1e9 + 7" want `%` after every step. For an exact huge answer, use `bigint`, a separate type that doesn't mix with `number` (`1n + 1` is TS2365).

```typescript
const MOD = 1_000_000_007;
let a = 1;
let b = 1;
for (let i = 2; i <= 1000; i++) [a, b] = [b, (a + b) % MOD];
console.log(b);  // 107579939, stair climbs for n = 1000, mod 1e9 + 7

let x: bigint = 0n;
let y: bigint = 1n;
for (let i = 0; i < 100; i++) [x, y] = [y, x + y];
console.log(x.toString());  // 354224848179261915075, the exact 100th Fibonacci
console.log(2 ** 53 + 1);   // 9007199254740992, a number already rounded
console.log(Number((BigInt(123456789) * BigInt(987654321)) % BigInt(MOD)));  // 259106859
```

### Setting one up

1. Say in words what `dp[i]` (or `dp[i][j]`) means, like "the fewest coins that make amount i".
2. Write how it follows from smaller entries.
3. Fill in the base cases: `dp[0]`, the first row, the first column.
4. Loop in an order where every entry you read is already filled.
5. Read the answer: `dp[n]`, `dp[m][n]`, or the best over the whole table.

### Gotchas

- `new Array(n).fill(new Array(m).fill(0))` shares one inner array across every row, and it type-checks. Use `Array.from({ length: n }, () => new Array<number>(m).fill(0))`, or push each row as you build it.
- A memo keyed by an array (`memo.get([i, j])`) never hits. Key by a string or by `i * cols + j`.
- `(a * b) % MOD` loses precision once `a * b` passes 2^53, which happens for two numbers near 1e9. Multiply as `bigint`, as in the last line above.
- A top-down memo recurses once per state, so about 9,000 states in a chain overflow the stack. Fill a table bottom-up instead.
