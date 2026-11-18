# Recursion and Backtracking

A recursive function calls itself on a smaller input and stops at a base case. Backtracking is recursion that builds a choice step by step: choose, recurse, then undo the choice, so one `path` array serves every branch. Give every recursive function a return type, since TypeScript can't infer one when a `return` uses the function's own result. Node allows about 9,000 nested calls here, plenty for subsets and permutations but not for a 100,000-node chain.

### Base case and recursive case

```typescript
function factorial(n: number): number {
  if (n <= 1) return 1;         // base case: stop here
  return n * factorial(n - 1);  // a smaller problem
}
console.log(factorial(5));  // 120

const power = (x: number, n: number): number => (n === 0 ? 1 : n % 2 === 0 ? power(x * x, n / 2) : x * power(x, n - 1));
console.log(power(2, 10));  // 1024, in O(log n) calls
```

Leave the return type off and the checker gives up on it:

```typescript error
const fact = (n: number) => (n <= 1 ? 1 : n * fact(n - 1));
// TS7023: 'fact' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
```

### A helper that carries an index

Pass an index instead of slicing, so no copies are made. Past the end, `nums[i]` is `undefined`, and that check is the base case.

```typescript
function sum(nums: readonly number[], i = 0): number {
  const x = nums[i];
  return x === undefined ? 0 : x + sum(nums, i + 1);
}
console.log(sum([4, 8, 15]));  // 27

function isPal(s: string, lo = 0, hi = s.length - 1): boolean {
  if (lo >= hi) return true;
  return s.charAt(lo) === s.charAt(hi) && isPal(s, lo + 1, hi - 1);
}
console.log(isPal("racecar"), isPal("rocket"));  // true false
```

### Subsets: take it or leave it

```typescript
function subsets(nums: readonly number[]): number[][] {
  const out: number[][] = [];
  const path: number[] = [];
  function go(i: number): void {
    const x = nums[i];
    if (x === undefined) {  // past the end: one subset is done
      out.push([...path]);  // copy it: path keeps changing
      return;
    }
    path.push(x);           // take it
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

```typescript
function combine(n: number, k: number): number[][] {
  const out: number[][] = [];
  const path: number[] = [];
  function go(start: number): void {
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

`entries()` gives each index with its value, so there's nothing to check.

```typescript
function permutations(nums: readonly number[]): string[] {
  const out: string[] = [];
  const path: number[] = [];
  const used = new Array<boolean>(nums.length).fill(false);
  function go(): void {
    if (path.length === nums.length) {
      out.push(path.join(""));
      return;
    }
    for (const [i, x] of nums.entries()) {
      if (used[i]) continue;
      used[i] = true;
      path.push(x);
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

```typescript
function combinationSum(candidates: readonly number[], target: number): number[][] {
  const nums = candidates.toSorted((a, b) => a - b);
  const out: number[][] = [];
  const path: number[] = [];
  function go(start: number, remaining: number): void {
    if (remaining === 0) {
      out.push([...path]);
      return;
    }
    for (let i = start; i < nums.length; i++) {
      const x = nums[i];
      if (x === undefined || x > remaining) break;  // every later number is bigger too
      path.push(x);
      go(i, remaining - x);  // i, not i + 1: it can be used again
      path.pop();
    }
  }
  go(0, target);
  return out;
}
console.log(JSON.stringify(combinationSum([3, 2, 6, 7], 7)));  // [[2,2,3],[7]]
```

### N-Queens: columns and diagonals

One queen per row. A column, a `row - col` diagonal, and a `row + col` diagonal can each hold one queen, so three `Set<number>` say what's taken.

```typescript
function nQueens(n: number): number {
  const cols = new Set<number>();
  const diag = new Set<number>();
  const anti = new Set<number>();
  let count = 0;
  function place(row: number): void {
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

Sort lists of lists with a compare function: by length, then item by item.

```typescript
function byLengthThenItems(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (const [i, x] of a.entries()) {
    const y = b[i] ?? 0;  // the same length, so always there
    if (x !== y) return x - y;
  }
  return 0;
}
const lists = [[2, 3], [1], [], [1, 3], [1, 2], [3], [2]];
console.log(lists.sort(byLengthThenItems).map((s) => `[${s.join(" ")}]`).join(" "));  // [] [1] [2] [3] [1 2] [1 3] [2 3]
```

### Generate valid strings

Building a new string `s + "("` on each call needs no undo step, since every call gets its own string.

```typescript
const out: string[] = [];
function parens(open: number, close: number, s: string, n: number): void {
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

### The depth limit

```typescript error
function depth(n: number): number {
  return n === 0 ? 0 : 1 + depth(n - 1);
}
console.log(depth(100000)); // RangeError: Maximum call stack size exceeded
```

### Gotchas

- `out.push(path)` stores the same array every time, so at the end every entry is empty. Push a copy, `[...path]`. The types can't tell the difference.
- Forgetting the undo (`path.pop()`, `used[i] = false`) leaks one branch's choice into the next.
- A function whose `return` uses its own result needs a return type, or it's TS7023. Annotating every recursive function, `function go(i: number): void` included, keeps it simple.
- Subsets and permutations grow as 2^n and n!, so n above about 20 (subsets) or 10 (permutations) is too slow to list them all.
