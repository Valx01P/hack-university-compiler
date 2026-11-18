# Two Pointers and Windows

Two indexes that move through the data replace a nested loop with one pass: from both ends inward on sorted data, a read and a write index in place, or the two edges of a window that grows and shrinks. Prefix sums answer any range sum with one subtraction. Keep the indexes as `int` so they can go below zero safely.

### Both ends: two sum on a sorted array

```cpp
#include <vector>

std::vector<int> nums = {2, 7, 11, 15};
int target = 9;
int i = 0, j = static_cast<int>(nums.size()) - 1;
while (i < j) {
    int sum = nums[i] + nums[j];
    if (sum == target) break;
    if (sum < target) i++;   // too small: move the left end up
    else j--;                // too big: move the right end down
}
std::cout << i + 1 << ' ' << j + 1 << '\n';   // 1 2, 1-based
```

### Both ends: a palindrome, skipping punctuation

The `<cctype>` tests take an `unsigned char`. A plain `char` above 127 is negative, and passing it is undefined behavior.

```cpp
#include <cctype>
#include <string>

bool isPalindrome(const std::string& s) {
    int i = 0, j = static_cast<int>(s.size()) - 1;
    while (i < j) {
        unsigned char a = s[i], b = s[j];
        if (!std::isalnum(a)) { i++; continue; }   // skip what isn't a letter or digit
        if (!std::isalnum(b)) { j--; continue; }
        if (std::tolower(a) != std::tolower(b)) return false;
        i++;
        j--;
    }
    return true;
}

std::cout << std::boolalpha << isPalindrome("A man, a plan, a canal: Panama") << '\n';   // true
std::cout << isPalindrome("race a car") << '\n';                                         // false
```

### Read and write: in place, order kept

```cpp
std::vector<int> v = {0, 1, 0, 3, 12};
int write = 0;
for (int x : v) {
    if (x != 0) v[write++] = x;            // keep it: copy it down
}
while (write < static_cast<int>(v.size())) v[write++] = 0;   // move zeroes: fill the rest
for (int x : v) std::cout << x << ' ';     // 1 3 12 0 0
std::cout << '\n';

std::vector<int> sorted = {1, 1, 2, 3, 3};
int k = 0;
for (int x : sorted) {
    if (k == 0 || sorted[k - 1] != x) sorted[k++] = x;   // remove duplicates
}
sorted.resize(k);
for (int x : sorted) std::cout << x << ' ';  // 1 2 3
```

### Merge two sorted arrays, and a subsequence check

```cpp
std::vector<int> a = {1, 4, 7}, b = {2, 3, 8, 9};
std::vector<int> out;
std::size_t i = 0, j = 0;
while (i < a.size() && j < b.size()) {
    if (a[i] <= b[j]) out.push_back(a[i++]);
    else out.push_back(b[j++]);
}
while (i < a.size()) out.push_back(a[i++]);   // whatever is left
while (j < b.size()) out.push_back(b[j++]);
for (int x : out) std::cout << x << ' ';      // 1 2 3 4 7 8 9
std::cout << '\n';

std::string s = "ace", t = "abcde";
std::size_t p = 0;
for (char c : t) {
    if (p < s.size() && s[p] == c) p++;      // match the next letter of s
}
std::cout << std::boolalpha << (p == s.size()) << '\n';   // true, "ace" is a subsequence
```

### Fixed window: the best k in a row

```cpp
std::vector<int> v = {2, 1, 5, 1, 3, 2};
int k = 3;
int sum = 0;
for (int i = 0; i < k; i++) sum += v[i];
int best = sum;
for (int i = k; i < static_cast<int>(v.size()); i++) {
    sum += v[i] - v[i - k];        // add the one entering, drop the one leaving
    best = std::max(best, sum);
}
std::cout << best << '\n';         // 9, from 5 1 3
```

### Variable window with an unordered_map: longest substring without repeats

Grow the right edge every step. When the window breaks the rule, move the left edge until it holds again.

```cpp
#include <unordered_map>

std::string s = "abcabcbb";
std::unordered_map<char, int> count;      // letters inside the window
int left = 0, best = 0;
for (int right = 0; right < static_cast<int>(s.size()); right++) {
    count[s[right]]++;
    while (count[s[right]] > 1) {         // a repeat: shrink from the left
        count[s[left]]--;
        left++;
    }
    best = std::max(best, right - left + 1);
}
std::cout << best << '\n';                // 3, "abc"

std::unordered_map<char, int> last;       // or jump: remember where each letter was
left = 0;
best = 0;
for (int right = 0; right < static_cast<int>(s.size()); right++) {
    auto it = last.find(s[right]);
    if (it != last.end() && it->second >= left) left = it->second + 1;
    last[s[right]] = right;
    best = std::max(best, right - left + 1);
}
std::cout << best << '\n';                // 3
```

### Variable window: shortest run with a sum of at least target

```cpp
#include <climits>

std::vector<int> v = {2, 3, 1, 2, 4, 3};
int target = 7, left = 0, sum = 0, shortest = INT_MAX;
for (int right = 0; right < static_cast<int>(v.size()); right++) {
    sum += v[right];
    while (sum >= target) {
        shortest = std::min(shortest, right - left + 1);
        sum -= v[left++];
    }
}
std::cout << (shortest == INT_MAX ? 0 : shortest) << '\n';   // 2, from 4 3
```

### Letter counts in a window: find all anagrams

An array of 26 counts indexed by `c - 'a'` is faster than a map, and two `std::array`s compare with `==`.

```cpp
#include <array>

std::string s = "cbaebabacd", p = "abc";
std::array<int, 26> need{}, have{};       // {} zeroes them
for (char c : p) need[c - 'a']++;
int m = static_cast<int>(p.size());
for (int i = 0; i < static_cast<int>(s.size()); i++) {
    have[s[i] - 'a']++;
    if (i >= m) have[s[i - m] - 'a']--;   // the letter that left the window
    if (have == need) std::cout << i - m + 1 << ' ';   // 0 6
}
```

### Prefix sums

`pre[i]` holds the sum of the first `i` values, so the sum of `v[l]` through `v[r]` is `pre[r + 1] - pre[l]`. Use `long long` when the totals can pass 2 billion.

```cpp
#include <numeric>   // std::partial_sum

std::vector<int> v = {3, 1, 4, 1, 5};
std::vector<long long> pre(v.size() + 1, 0);
for (std::size_t i = 0; i < v.size(); i++) pre[i + 1] = pre[i] + v[i];
std::cout << pre[4] - pre[1] << '\n';      // 6, v[1] + v[2] + v[3]

std::vector<int> running(v.size());
std::partial_sum(v.begin(), v.end(), running.begin());
for (int x : running) std::cout << x << ' ';   // 3 4 8 9 14, running totals
```

### Prefix sums with a map: subarrays that sum to k

```cpp
std::vector<int> v = {1, 2, 3, -2, 2};
int k = 3;
std::unordered_map<long long, int> seen = {{0, 1}};   // the empty prefix
long long sum = 0;
int count = 0;
for (int x : v) {
    sum += x;
    auto it = seen.find(sum - k);          // an earlier prefix that leaves exactly k
    if (it != seen.end()) count += it->second;
    seen[sum]++;
}
std::cout << count << '\n';                // 4: [1 2], [3], [2 3 -2], [3 -2 2]
```

### Prefix and suffix products

Product of the array except self, with no division: one pass leaves the product of everything to the left, a second pass from the right multiplies in everything to the right.

```cpp
std::vector<int> nums = {1, 2, 3, 4};
std::vector<int> out(nums.size(), 1);
int before = 1;
for (std::size_t i = 0; i < nums.size(); i++) {
    out[i] = before;               // the product of everything to the left
    before *= nums[i];
}
int after = 1;
for (int i = static_cast<int>(nums.size()) - 1; i >= 0; i--) {
    out[i] *= after;               // times everything to the right
    after *= nums[i];
}
for (int x : out) std::cout << x << ' ';   // 24 12 8 6
```

### Which pattern

| Problem says | Reach for |
|---|---|
| sorted, find a pair | both ends inward |
| in place, keep the order | a read and a write index |
| k in a row | a fixed window |
| longest or shortest run that obeys a rule | a variable window |
| range sums, or a sum of exactly k with negatives | prefix sums, with a map for exactly k |

### Gotchas

- `for (std::size_t j = v.size() - 1; j >= 0; j--)` never ends: an unsigned `j` is always `>= 0`, and `v.size() - 1` on an empty vector is huge. Use `int`.
- A variable window needs only positive values to shrink safely. With negatives, use prefix sums and a map.
- Reading `count[c]` on an `unordered_map` inserts a 0. Use `find` when you only want to look.
- Sums of many `int`s overflow quietly. Store totals in `long long`.
