# Dynamic Programming

Dynamic programming solves every smaller version of a problem once and stores the answers. Top down, a recursive function caches what it returns (memoization). Bottom up, a loop fills a table from the base cases. Go has no `@cache` decorator, so you write the cache yourself: a slice when the arguments are small ints, a map otherwise.

### Memo with a slice

```go
func climb(n int, memo []int) int {
	if n <= 1 {
		return 1 // one way up 0 or 1 stairs
	}
	if memo[n] != 0 {
		return memo[n] // solved already
	}
	memo[n] = climb(n-1, memo) + climb(n-2, memo)
	return memo[n]
}

n := 45
fmt.Println(climb(n, make([]int, n+1))) // 1836311903, instantly, not 2^45 calls
```

A slice memo uses 0 for "not solved yet". When 0 can be a real answer, fill it with -1 first.

### Memo with a map, for two arguments

An array is comparable, so `[2]int` works as a map key. A struct does too.

```go
memo := map[[2]int]int{}
var paths func(r, c int) int
paths = func(r, c int) int {
	if r == 0 || c == 0 {
		return 1 // along an edge there is one way
	}
	key := [2]int{r, c}
	if v, ok := memo[key]; ok {
		return v
	}
	memo[key] = paths(r-1, c) + paths(r, c-1)
	return memo[key]
}
fmt.Println(paths(2, 6)) // 28, the paths across a 3 by 7 grid
```

### 1D table, then two variables

```go
n := 5
dp := make([]int, n+1) // dp[i]: ways up i stairs, size n + 1 so dp[n] exists
dp[0], dp[1] = 1, 1
for i := 2; i <= n; i++ {
	dp[i] = dp[i-1] + dp[i-2]
}
fmt.Println(dp[n]) // 8

prev, cur := 1, 1 // only the last two entries matter
for i := 2; i <= n; i++ {
	prev, cur = cur, prev+cur
}
fmt.Println(cur) // 8
```

### Take or skip: house robber

```go
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

houses := []int{2, 7, 9, 3, 1}
dp := make([]int, len(houses)+1) // dp[i]: the most from the first i houses
dp[1] = houses[0]
for i := 2; i <= len(houses); i++ {
	dp[i] = maxInt(dp[i-1], dp[i-2]+houses[i-1]) // skip house i-1, or take it
}
fmt.Println(dp[len(houses)]) // 12, from 2 + 9 + 1
```

### Fewest coins: coin change

```go
coins := []int{1, 2, 5}
amount := 11
dp := make([]int, amount+1) // dp[a]: the fewest coins that make a
for a := 1; a <= amount; a++ {
	dp[a] = amount + 1 // more than any real answer, and safe to add 1 to
	for _, c := range coins {
		if c <= a && dp[a-c]+1 < dp[a] {
			dp[a] = dp[a-c] + 1
		}
	}
}
if dp[amount] > amount {
	fmt.Println(-1) // no mix of coins makes it
} else {
	fmt.Println(dp[amount]) // 3, from 5 + 5 + 1
}
```

### 2D table over a grid: paths around walls

```go
grid := [][]int{{0, 0, 0}, {0, 1, 0}, {0, 0, 0}} // 1 is a wall
rows, cols := len(grid), len(grid[0])
dp := make([][]int, rows)
for r := range dp {
	dp[r] = make([]int, cols) // each row needs its own make
}
for r := 0; r < rows; r++ {
	for c := 0; c < cols; c++ {
		if grid[r][c] == 1 {
			continue // no way through a wall: stays 0
		}
		if r == 0 && c == 0 {
			dp[r][c] = 1
			continue
		}
		if r > 0 {
			dp[r][c] += dp[r-1][c] // from above
		}
		if c > 0 {
			dp[r][c] += dp[r][c-1] // from the left
		}
	}
}
fmt.Println(dp[rows-1][cols-1]) // 2
```

### 2D table over two strings: longest common subsequence

```go
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

a, b := "abcde", "ace"
dp := make([][]int, len(a)+1) // dp[i][j]: the answer for a[:i] and b[:j]
for i := range dp {
	dp[i] = make([]int, len(b)+1)
}
for i := 1; i <= len(a); i++ {
	for j := 1; j <= len(b); j++ {
		if a[i-1] == b[j-1] {
			dp[i][j] = dp[i-1][j-1] + 1 // the same letter extends both
		} else {
			dp[i][j] = maxInt(dp[i-1][j], dp[i][j-1]) // drop a letter from one side
		}
	}
}
fmt.Println(dp[len(a)][len(b)]) // 3, "ace"
```

### Running best: maximum subarray (Kadane)

```go
nums := []int{-2, 1, -3, 4, -1, 2, 1, -5, 4}
cur, best := nums[0], nums[0] // start from the first number, not 0, for all-negative input
for _, x := range nums[1:] {
	if cur+x > x {
		cur += x // extend the run
	} else {
		cur = x // start over at x
	}
	if cur > best {
		best = cur
	}
}
fmt.Println(best) // 6, from 4 -1 2 1
```

### Setting one up

| Step | Ask |
| --- | --- |
| State | What does `dp[i]` (or `dp[i][j]`) mean, in words? |
| Base cases | Which entries are known without any work? |
| Transition | Which smaller entries build `dp[i]`? |
| Order | Fill so every entry you read is already filled. |
| Answer | Which entry holds it: `dp[n]`, `dp[m][n]`, or the best of all? |

### Gotchas

- Go 1.16 has no built-in `min` or `max` for ints, and `math.Max` takes `float64`. Write `maxInt` and `minInt`.
- `math.MaxInt64 + 1` wraps to the most negative int. Fill "impossible" with a safe value like `amount + 1`, or check before adding.
- `make([][]int, rows)` leaves every row nil. Make each row, or `dp[r][c]` panics.
- `int` is 64 bits on Piston, so counts fit up to about 9.2e18. Past that, take the modulus the problem gives (`% 1_000_000_007`) at every step.
