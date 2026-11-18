# Recursion and Backtracking

A recursive function calls itself on a smaller input until it reaches a base case it can answer directly. Backtracking uses that to try every choice: choose, explore with a recursive call, then undo the choice. Pass vectors by reference so no call copies them.

### Base case and recursive case

```cpp
long long factorial(int n) {
    if (n <= 1) return 1;              // base case: stops the calls
    return n * factorial(n - 1);       // recursive case: a smaller n
}

int digitSum(int n) {
    return n < 10 ? n : n % 10 + digitSum(n / 10);
}

std::cout << factorial(20) << '\n';    // 2432902008176640000, needs long long
std::cout << digitSum(4096) << '\n';   // 19
```

### A helper that carries indexes

The public function starts the work, and a helper takes the extra state: an index, a range, or the result so far.

```cpp
#include <string>
#include <vector>

int sumFrom(const std::vector<int>& v, std::size_t i) {
    if (i == v.size()) return 0;
    return v[i] + sumFrom(v, i + 1);
}

bool isPal(const std::string& s, int lo, int hi) {
    if (lo >= hi) return true;
    return s[lo] == s[hi] && isPal(s, lo + 1, hi - 1);
}

std::cout << sumFrom({3, 1, 4}, 0) << '\n';                                // 8
std::cout << std::boolalpha << isPal("racecar", 0, 6) << '\n';             // true
```

### Subsets: take it or leave it

```cpp
void subsets(const std::vector<int>& nums, std::size_t i, std::vector<int>& cur, std::vector<std::vector<int>>& out) {
    if (i == nums.size()) {
        out.push_back(cur);              // one full set of choices
        return;
    }
    cur.push_back(nums[i]);              // take nums[i]
    subsets(nums, i + 1, cur, out);
    cur.pop_back();                      // undo, then leave it
    subsets(nums, i + 1, cur, out);
}

std::vector<int> nums = {1, 2, 3};
std::vector<int> cur;
std::vector<std::vector<int>> all;
subsets(nums, 0, cur, all);
std::cout << all.size() << '\n';         // 8, 2 to the power 3
for (int x : all[1]) std::cout << x;     // 12, the second set made
```

### Sort the results

Problems often want subsets by length, then in order. Vectors compare item by item, so the second key is just `<`.

```cpp harness
std::vector<std::vector<int>> all = {{1, 2, 3}, {1, 2}, {1, 3}, {1}, {2, 3}, {2}, {3}, {}};
{{code}}
```

```cpp
#include <algorithm>

std::sort(all.begin(), all.end(), [](const std::vector<int>& a, const std::vector<int>& b) {
    if (a.size() != b.size()) return a.size() < b.size();   // shorter first
    return a < b;                                           // then item by item
});
for (const auto& s : all) {
    std::cout << '[';
    for (std::size_t i = 0; i < s.size(); i++) std::cout << (i ? " " : "") << s[i];
    std::cout << "] ";
}
// [] [1] [2] [3] [1 2] [1 3] [2 3] [1 2 3]
```

### Combinations: a start index

```cpp
void combine(int n, int k, int start, std::vector<int>& cur, std::vector<std::vector<int>>& out) {
    if (static_cast<int>(cur.size()) == k) {
        out.push_back(cur);
        return;
    }
    for (int x = start; x <= n; x++) {
        cur.push_back(x);                    // choose
        combine(n, k, x + 1, cur, out);      // explore, only larger numbers after
        cur.pop_back();                      // un-choose
    }
}

std::vector<int> cur;
std::vector<std::vector<int>> out;
combine(4, 2, 1, cur, out);
for (const auto& c : out) std::cout << c[0] << c[1] << ' ';   // 12 13 14 23 24 34
```

### Permutations: a used array, or std::next_permutation

```cpp
void permute(const std::vector<int>& nums, std::vector<bool>& used, std::vector<int>& cur, std::vector<std::vector<int>>& out) {
    if (cur.size() == nums.size()) {
        out.push_back(cur);
        return;
    }
    for (std::size_t i = 0; i < nums.size(); i++) {
        if (used[i]) continue;
        used[i] = true;
        cur.push_back(nums[i]);
        permute(nums, used, cur, out);
        cur.pop_back();
        used[i] = false;                     // undo both
    }
}

std::vector<int> nums = {1, 2, 3};
std::vector<bool> used(nums.size(), false);
std::vector<int> cur;
std::vector<std::vector<int>> out;
permute(nums, used, cur, out);
std::cout << out.size() << ' ' << out[1][0] << out[1][1] << out[1][2] << '\n';   // 6 132

std::sort(nums.begin(), nums.end());          // start from the smallest order
do {
    std::cout << nums[0] << nums[1] << nums[2] << ' ';   // 123 132 213 231 312 321
} while (std::next_permutation(nums.begin(), nums.end()));
```

`std::next_permutation` from `<algorithm>` rearranges into the next order up and returns `false` after the last one, which also skips duplicate orders. It's a quick way to check a backtracking answer.

### Combination sum: reuse and a running total

```cpp
void search(const std::vector<int>& coins, std::size_t start, int left, std::vector<int>& cur, std::vector<std::vector<int>>& out) {
    if (left == 0) {
        out.push_back(cur);
        return;
    }
    for (std::size_t i = start; i < coins.size(); i++) {
        if (coins[i] > left) break;              // sorted, so the rest are too big
        cur.push_back(coins[i]);
        search(coins, i, left - coins[i], cur, out);   // i, not i + 1: reuse allowed
        cur.pop_back();
    }
}

std::vector<int> coins = {7, 3, 2, 6};
std::sort(coins.begin(), coins.end());
std::vector<int> cur;
std::vector<std::vector<int>> out;
search(coins, 0, 7, cur, out);
for (const auto& c : out) {
    for (int x : c) std::cout << x;
    std::cout << ' ';
}
// 223 7, that is 2 + 2 + 3 and 7
```

### N-Queens: columns and diagonals

One queen per row. A column, a `row - col` diagonal, and a `row + col` diagonal can each hold one queen.

```cpp
int place(int row, int n, std::vector<bool>& col, std::vector<bool>& diag, std::vector<bool>& anti) {
    if (row == n) return 1;                      // every row has a queen
    int count = 0;
    for (int c = 0; c < n; c++) {
        if (col[c] || diag[row - c + n - 1] || anti[row + c]) continue;
        col[c] = diag[row - c + n - 1] = anti[row + c] = true;
        count += place(row + 1, n, col, diag, anti);
        col[c] = diag[row - c + n - 1] = anti[row + c] = false;
    }
    return count;
}

int n = 6;
std::vector<bool> col(n), diag(2 * n - 1), anti(2 * n - 1);
std::cout << place(0, n, col, diag, anti) << '\n';   // 4
```

### A recursive lambda

```cpp
#include <functional>

std::function<int(int)> fib = [&](int k) { return k < 2 ? k : fib(k - 1) + fib(k - 2); };
std::cout << fib(10) << '\n';   // 55
```

A lambda can't name itself, so store it in a `std::function` and capture that by reference.

### Gotchas

- Every path needs to reach a base case. A missing one recurses until the stack overflows and the program crashes with a segmentation fault.
- The stack is 8 MB here, enough for roughly 100,000 small calls. Deeper recursion, like DFS down a long chain, needs a loop and an explicit stack.
- Forgetting the undo (`pop_back`, `used[i] = false`) leaks one branch's choice into the next. Every choose needs its un-choose.
- Pass `std::vector` parameters by `&` or `const&`. By value, every call copies the whole vector.
