# Dynamic Programming

Dynamic programming solves a problem from the answers to its smaller versions and stores each one so it's computed once. Top down, a recursive function saves results in a memo. Bottom up, a loop fills a table from the smallest case. Counts grow fast, so store them in `long long`.

### Memo with a vector

Fill the memo with a value no real answer can be, like -1, and check it before you recurse.

```cpp
#include <vector>

long long ways(int n, std::vector<long long>& memo) {   // climbing stairs: 1 or 2 steps at a time
    if (n <= 1) return 1;
    if (memo[n] != -1) return memo[n];                  // already solved
    return memo[n] = ways(n - 1, memo) + ways(n - 2, memo);
}

int n = 50;
std::vector<long long> memo(n + 1, -1);
std::cout << ways(n, memo) << '\n';   // 20365011074, too big for int
```

### Memo with an unordered_map, for two arguments

Pack both arguments into one key, or use a `std::map` with a `std::pair` key (an `unordered_map` has no hash for pairs).

```cpp
#include <map>
#include <unordered_map>
#include <utility>

long long paths(int r, int c, std::unordered_map<long long, long long>& memo) {   // grid paths, right or down
    if (r == 0 || c == 0) return 1;
    long long key = 1LL * r * 1000 + c;                  // unique while c < 1000
    auto it = memo.find(key);
    if (it != memo.end()) return it->second;
    return memo[key] = paths(r - 1, c, memo) + paths(r, c - 1, memo);
}

std::unordered_map<long long, long long> memo;
std::cout << paths(16, 16, memo) << '\n';   // 601080390

std::map<std::pair<int, int>, long long> byPair;   // a pair key works in a std::map
byPair[{2, 3}] = 10;
std::cout << byPair.count({2, 3}) << '\n';    // 1
```

### 1D table, then two variables

```cpp
int n = 10;
std::vector<long long> dp(n + 1);
dp[0] = 1;                             // one way to stand still
dp[1] = 1;
for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
std::cout << dp[n] << '\n';            // 89

long long prev = 1, cur = 1;           // each step only needs the last two
for (int i = 2; i <= n; i++) {
    long long next = prev + cur;
    prev = cur;
    cur = next;
}
std::cout << cur << '\n';              // 89
```

### Take or skip: house robber

`best[i]` is the most you can take from the first `i` houses: skip house `i - 1`, or take it plus the best from two houses back.

```cpp
#include <algorithm>

std::vector<int> houses = {2, 7, 9, 3, 1};
std::vector<long long> best(houses.size() + 1, 0);
best[1] = houses[0];
for (std::size_t i = 2; i <= houses.size(); i++) {
    best[i] = std::max(best[i - 1], best[i - 2] + houses[i - 1]);
}
std::cout << best[houses.size()] << '\n';   // 12, from 2 + 9 + 1
```

### Fewest coins: coin change

```cpp
std::vector<int> coins = {1, 2, 5};
int amount = 11;
const int INF = amount + 1;                 // more coins than could ever be needed
std::vector<int> dp(amount + 1, INF);
dp[0] = 0;
for (int a = 1; a <= amount; a++) {
    for (int c : coins) {
        if (c <= a && dp[a - c] != INF) dp[a] = std::min(dp[a], dp[a - c] + 1);
    }
}
std::cout << (dp[amount] == INF ? -1 : dp[amount]) << '\n';   // 3, from 5 + 5 + 1
```

Using `INT_MAX` as the sentinel breaks here: `INT_MAX + 1` overflows to a negative number and wins every `min`.

### 2D table over a grid: paths around walls

```cpp
std::vector<std::vector<int>> grid = {{0, 0, 0}, {0, 1, 0}, {0, 0, 0}};   // 1 is a wall
int R = static_cast<int>(grid.size()), C = static_cast<int>(grid[0].size());
std::vector<std::vector<long long>> dp(R, std::vector<long long>(C, 0));
for (int r = 0; r < R; r++) {
    for (int c = 0; c < C; c++) {
        if (grid[r][c] == 1) continue;              // no path through a wall
        if (r == 0 && c == 0) {
            dp[r][c] = 1;
            continue;
        }
        if (r > 0) dp[r][c] += dp[r - 1][c];        // from above
        if (c > 0) dp[r][c] += dp[r][c - 1];        // from the left
    }
}
std::cout << dp[R - 1][C - 1] << '\n';              // 2
```

### 2D table over two strings: longest common subsequence

`dp[i][j]` is the answer for the first `i` letters of `a` and the first `j` of `b`. The extra row and column of zeros are the empty prefixes.

```cpp
#include <string>

std::string a = "abcde", b = "ace";
std::size_t n = a.size(), m = b.size();
std::vector<std::vector<int>> dp(n + 1, std::vector<int>(m + 1, 0));
for (std::size_t i = 1; i <= n; i++) {
    for (std::size_t j = 1; j <= m; j++) {
        if (a[i - 1] == b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;   // the letters match
        else dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);       // drop one letter
    }
}
std::cout << dp[n][m] << '\n';   // 3, "ace"
```

### Running best: maximum subarray (Kadane)

```cpp
std::vector<int> v = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
long long here = v[0], best = v[0];       // start from v[0], so all negatives work
for (std::size_t i = 1; i < v.size(); i++) {
    here = std::max<long long>(v[i], here + v[i]);   // extend the run, or start over
    best = std::max(best, here);
}
std::cout << best << '\n';                // 6, from 4 -1 2 1
```

### Setting one up

1. Name the state: what `dp[i]` (or `dp[i][j]`) means, in words.
2. Write the recurrence: how one entry comes from smaller ones.
3. Set the base cases: the entries that need no recurrence.
4. Fill in an order where every entry's inputs are already done.
5. Read the answer, often the last entry.

| Table | Size | Cost |
|---|---|---|
| 1D over `n` | `std::vector<long long> dp(n + 1)` | O(n) times the work per entry |
| 2D over a grid | `std::vector<std::vector<long long>> dp(R, std::vector<long long>(C))` | O(R * C) |
| 2D over two strings | `(n + 1)` by `(m + 1)` | O(n * m) |

### Gotchas

- Counts overflow `int` quickly (climbing 50 stairs has over 20 billion ways). Use `long long`, and the problem's modulus if it gives one.
- Size tables `n + 1` when `dp[n]` is the answer. `std::vector<int> dp(n)` makes `dp[n]` out of bounds, with no error.
- A memo sentinel must be impossible as an answer. If 0 is a real answer, -1 marks "not computed".
- A recursive memo can still overflow the stack for big `n`. A bottom-up table never recurses.
