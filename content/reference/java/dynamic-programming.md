# Dynamic Programming

Dynamic programming saves the answer to every smaller problem so each one is computed once. Top down, you write the recursion and cache its results in an array or a `HashMap` (memoization). Bottom up, you fill a table from the smallest case (tabulation). Use `long` when counts grow fast.

### Memo with an array

```java
import java.util.Arrays;

static long ways(int n, long[] memo) {     // climbing stairs, 1 or 2 steps at a time
    if (n <= 1) {
        return 1;
    }
    if (memo[n] != -1) {
        return memo[n];                    // computed before
    }
    memo[n] = ways(n - 1, memo) + ways(n - 2, memo);
    return memo[n];
}

int n = 50;
long[] memo = new long[n + 1];
Arrays.fill(memo, -1);                     // -1 means not computed, since 0 can be a real answer
System.out.println(ways(n, memo));         // 20365011074
```

### Memo with a HashMap, for two arguments

Paths through an r by c grid moving only right or down. The key joins both arguments.

```java
import java.util.HashMap;
import java.util.Map;

static long paths(int r, int c, Map<String, Long> memo) {
    if (r == 1 || c == 1) {
        return 1;
    }
    String key = r + "," + c;              // or (long) r * 100_000 + c
    if (memo.containsKey(key)) {
        return memo.get(key);
    }
    long result = paths(r - 1, c, memo) + paths(r, c - 1, memo);
    memo.put(key, result);
    return result;
}

System.out.println(paths(3, 7, new HashMap<>()));    // 28
System.out.println(paths(18, 18, new HashMap<>()));  // 2333606220, past the int range
```

### 1D table, then two variables

```java
int n = 10;
long[] dp = new long[n + 1];
dp[0] = 1;
dp[1] = 1;
for (int i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
}
System.out.println(dp[n]);                 // 89

long prev = 1;
long cur = 1;                              // only the last two values matter
for (int i = 2; i <= n; i++) {
    long next = prev + cur;
    prev = cur;
    cur = next;
}
System.out.println(cur);                   // 89
```

### Take or skip: house robber

```java
int[] houses = {2, 7, 9, 3, 1};
int[] best = new int[houses.length + 1];   // best[i]: the most from the first i houses
best[1] = houses[0];
for (int i = 2; i <= houses.length; i++) {
    best[i] = Math.max(best[i - 1], best[i - 2] + houses[i - 1]); // skip it, or take it
}
System.out.println(best[houses.length]);   // 12, from 2 + 9 + 1
```

### Fewest coins: coin change

```java
static int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, amount + 1);           // more than any real answer, and safe to add 1 to
    dp[0] = 0;
    for (int a = 1; a <= amount; a++) {
        for (int coin : coins) {
            if (coin <= a) {
                dp[a] = Math.min(dp[a], dp[a - coin] + 1);
            }
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}

System.out.println(coinChange(new int[]{1, 2, 5}, 11)); // 3, from 5 + 5 + 1
System.out.println(coinChange(new int[]{2}, 3));        // -1, impossible
```

### 2D table over a grid: paths around walls

```java
int[][] grid = {{0, 0, 0}, {0, 1, 0}, {0, 0, 0}};   // 1 is a wall
int rows = grid.length;
int cols = grid[0].length;
long[][] dp = new long[rows][cols];
for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) {
        if (grid[r][c] == 1) {
            dp[r][c] = 0;                          // no path goes through a wall
        } else if (r == 0 && c == 0) {
            dp[r][c] = 1;
        } else {
            long fromUp = r > 0 ? dp[r - 1][c] : 0;
            long fromLeft = c > 0 ? dp[r][c - 1] : 0;
            dp[r][c] = fromUp + fromLeft;
        }
    }
}
System.out.println(dp[rows - 1][cols - 1]);        // 2
```

### 2D table over two strings: longest common subsequence

```java
String a = "abcde";
String b = "ace";
int[][] dp = new int[a.length() + 1][b.length() + 1]; // row 0 and column 0 stay 0
for (int i = 1; i <= a.length(); i++) {
    for (int j = 1; j <= b.length(); j++) {
        if (a.charAt(i - 1) == b.charAt(j - 1)) {
            dp[i][j] = dp[i - 1][j - 1] + 1;            // a match extends the diagonal
        } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
}
System.out.println(dp[a.length()][b.length()]);        // 3, "ace"
```

### Running best: maximum subarray (Kadane)

```java
int[] nums = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
int endingHere = nums[0];
int best = nums[0];
for (int i = 1; i < nums.length; i++) {
    endingHere = Math.max(nums[i], endingHere + nums[i]);  // extend, or start over here
    best = Math.max(best, endingHere);
}
System.out.println(best); // 6, from 4 - 1 + 2 + 1
```

### Setting one up

| Step | Ask |
| --- | --- |
| state | what does `dp[i]` or `dp[i][j]` mean, in words? |
| base case | which entries are known without any work? |
| transition | how does an entry follow from smaller ones? |
| order | fill so every entry you read is already filled |
| answer | which entry holds it? |

### The computeIfAbsent trap

A `HashMap` memo filled by `computeIfAbsent` with a recursive call inside throws, because the inner calls change the map while the outer call is still running.

```java error
static Map<Integer, Long> memo = new HashMap<>();

static long fib(int n) {
    if (n < 2) {
        return n;
    }
    return memo.computeIfAbsent(n, k -> fib(k - 1) + fib(k - 2));
}

System.out.println(fib(30)); // throws ConcurrentModificationException
```

### Gotchas

- Use `containsKey`, `get`, and `put` for a recursive `HashMap` memo, never `computeIfAbsent`.
- Counts overflow `int` fast. Use `long`, and the modulus (`% 1_000_000_007`) when the problem asks for one.
- Filling a table with `Integer.MAX_VALUE` and then adding 1 wraps to a negative number. Fill with a value like `amount + 1` instead.
- A table of size `n` has no `dp[n]`. Size it `n + 1` when the answer sits at index `n`.
