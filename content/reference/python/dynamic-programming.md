# Dynamic Programming

Dynamic programming builds an answer from the answers to smaller versions of the same problem, working out each smaller answer once. Write the recurrence first. Then either cache a recursive function with `functools.cache` (top down), or fill a list in a loop (bottom up).

### Memo with functools.cache

```python
from functools import cache, lru_cache

@cache                          # remembers every result by its arguments
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(80))                  # 23416728348467685
print(fib.cache_info().currsize)   # 81  one entry per n from 0 to 80

@lru_cache(maxsize=None)        # the same as @cache, older spelling
def ways(n):
    return 1 if n <= 1 else ways(n - 1) + ways(n - 2)

print(ways(10))                 # 89
```

`@lru_cache(maxsize=128)` keeps only the 128 most recent results. `fib.cache_clear()` empties the cache.

### Memo with a dict, for two arguments

```python
def grid_paths(rows, cols):
    memo = {}
    def go(r, c):
        if r == 0 or c == 0:
            return 1
        if (r, c) not in memo:            # a tuple key for two arguments
            memo[(r, c)] = go(r - 1, c) + go(r, c - 1)
        return memo[(r, c)]
    return go(rows - 1, cols - 1)

print(grid_paths(3, 7))                   # 28
```

### 1D table, then two variables: climbing stairs

`dp[i]` is the number of ways to reach step `i`. The last move was 1 or 2 steps, so `dp[i] = dp[i - 1] + dp[i - 2]`.

```python
def climb(n):
    dp = [0] * (n + 1)
    dp[0] = dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]

def climb_small(n):           # only the last two values matter
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

print(climb(5), climb_small(5), climb_small(1))   # 8 8 1
```

### Take or skip: house robber

At each house, the best is either the best without it, or this house plus the best from two houses back.

```python
def rob(nums):
    dp = [0] * (len(nums) + 1)          # dp[i]: the best from the first i houses
    for i, x in enumerate(nums, start=1):
        dp[i] = max(dp[i - 1], (dp[i - 2] if i >= 2 else 0) + x)
    return dp[-1]

def rob_small(nums):
    prev, curr = 0, 0                   # the best two houses back, and one back
    for x in nums:
        prev, curr = curr, max(curr, prev + x)
    return curr

print(rob([2, 7, 9, 3, 1]), rob_small([2, 7, 9, 3, 1]), rob_small([]))   # 12 12 0
```

### Fewest coins and counting ways: coin change

```python
def coin_change(coins, amount):
    INF = float("inf")
    dp = [0] + [INF] * amount           # dp[a]: the fewest coins that make a
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return dp[amount] if dp[amount] != INF else -1

def count_ways(coins, amount):
    ways = [1] + [0] * amount
    for c in coins:                     # coins outside: each mix counted once
        for a in range(c, amount + 1):
            ways[a] += ways[a - c]
    return ways[amount]

print(coin_change([1, 2, 5], 11), coin_change([2], 3))   # 3 -1
print(count_ways([1, 2, 5], 5))                          # 4
```

### 2D table over a grid: paths around walls

`dp[r][c]` is the number of paths to cell `(r, c)`, coming from above or from the left. A wall has 0.

```python
grid = [
    [0, 0, 0],
    [0, 1, 0],                          # 1 is a wall
    [0, 0, 0],
]
rows, cols = len(grid), len(grid[0])
dp = [[0] * cols for _ in range(rows)]
for r in range(rows):
    for c in range(cols):
        if grid[r][c] == 1:
            dp[r][c] = 0
        elif r == 0 and c == 0:
            dp[r][c] = 1
        else:
            up = dp[r - 1][c] if r > 0 else 0
            left = dp[r][c - 1] if c > 0 else 0
            dp[r][c] = up + left
print(dp[-1][-1])                       # 2
```

### 2D table over two strings: longest common subsequence

`dp[i][j]` compares the first `i` letters of `a` with the first `j` letters of `b`. Row 0 and column 0 stand for an empty string.

```python
def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]

print(lcs("abcde", "ace"), lcs("abc", "def"))   # 3 0
```

Edit distance has the same table: on a match copy `dp[i - 1][j - 1]`, otherwise take 1 plus the smallest of the three neighbors.

### Running best: maximum subarray (Kadane)

```python
def max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)           # extend the run, or start over at x
        best = max(best, cur)
    return best

print(max_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]))   # 6
print(max_subarray([-3, -1, -2]))                      # -1  all negative
```

### The shared row trap

```python
dp = [[0] * 3] * 2              # two references to ONE row
dp[0][0] = 1
print(dp)                       # [[1, 0, 0], [1, 0, 0]]
dp = [[0] * 3 for _ in range(2)]
dp[0][0] = 1
print(dp)                       # [[1, 0, 0], [0, 0, 0]]
```

### Setting one up

1. Say in words what `dp[i]` (or `dp[i][j]`) means, like "the fewest coins that make amount i".
2. Write how it follows from smaller entries.
3. Fill in the base cases: `dp[0]`, the first row, the first column.
4. Loop in an order where every entry you read is already filled.
5. Read the answer: `dp[n]`, `dp[-1][-1]`, or the best over the whole table.

### Gotchas

- `@cache` needs hashable arguments. A list argument raises `TypeError`, so pass a tuple, or an index into a list the function can see.
- A cached function at the top level keeps its results between test cases. If it reads data that changes, call `f.cache_clear()`, or define it inside the function that solves one case.
- On Python 3.12.0, the version here, recursion through `@cache` or `@lru_cache` stops with `RecursionError` near 500 levels, even after `sys.setrecursionlimit`. For deeper inputs, fill a table, or use a dict memo with a raised limit.
- `float("inf")` marks "impossible" in a min table. Check for it before you print, and print -1 or whatever the problem asks.
