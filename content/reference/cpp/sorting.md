# Sorting and Comparators

`std::sort` from `<algorithm>` sorts a range in place, ascending by `<`. For any other order, pass a comparator: a function or lambda that returns `true` when `a` must come before `b`. `std::sort` is not stable, so use `std::stable_sort` when equal items must keep their earlier order.

### Ascending and descending

```cpp
#include <algorithm>   // std::sort, std::stable_sort, std::reverse
#include <functional>  // std::greater
#include <vector>

std::vector<int> v = {5, 2, 9, 1};
std::sort(v.begin(), v.end());
for (int x : v) std::cout << x << ' ';            // 1 2 5 9
std::cout << '\n';
std::sort(v.begin(), v.end(), std::greater<>());  // largest first
for (int x : v) std::cout << x << ' ';            // 9 5 2 1
std::cout << '\n';
std::sort(v.rbegin(), v.rend());                  // sorting it backwards is also descending
std::sort(v.begin() + 1, v.end());                // only from index 1 on
for (int x : v) std::cout << x << ' ';            // 9 1 2 5
std::cout << '\n';
int a[] = {3, 1, 2};
std::sort(a, a + 3);                              // a C array: pointers work as iterators
std::cout << a[0] << a[1] << a[2] << '\n';        // 123
std::string s = "listen";
std::sort(s.begin(), s.end());
std::cout << s << '\n';                           // eilnst, a key for anagrams
```

### By a key with a lambda

```cpp
std::vector<int> nums = {-7, 3, -1, 5};
std::sort(nums.begin(), nums.end(), [](int a, int b) -> bool {
    return std::abs(a) < std::abs(b);            // by absolute value
});
for (int x : nums) std::cout << x << ' ';        // -1 3 5 -7
std::cout << '\n';

std::vector<std::string> words = {"kiwi", "fig", "banana", "date"};
std::stable_sort(words.begin(), words.end(), [](const std::string& a, const std::string& b) {
    return a.size() < b.size();                  // shorter first
});
for (const auto& w : words) std::cout << w << ' ';   // fig kiwi date banana, kiwi stays before date
```

### Two keys

Compare the first key, and only when it ties compare the second. `std::tie` from `<tuple>` builds the same comparison in one line. Swap `a` and `b` on one side to flip that key.

```cpp
#include <tuple>

std::vector<std::string> words = {"pear", "fig", "apple", "kiwi", "date"};
std::sort(words.begin(), words.end(), [](const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return a.size() < b.size();  // length first
    return a < b;                                          // then A to Z
});
for (const auto& w : words) std::cout << w << ' ';   // fig date kiwi pear apple
std::cout << '\n';

std::vector<std::pair<std::string, int>> scores = {{"cy", 90}, {"ana", 95}, {"bo", 90}};
std::sort(scores.begin(), scores.end(), [](const auto& a, const auto& b) {
    return std::tie(b.second, a.first) < std::tie(a.second, b.first);  // score high first, then name
});
for (const auto& [name, score] : scores) std::cout << name << score << ' ';  // ana95 bo90 cy90
```

### Pairs, arrays, and rows

Pairs, `std::array`, and `std::vector` already compare item by item, left to right. So with no comparator they sort by the first item, then the second (a `std::vector<std::vector<int>>` of intervals too).

```cpp
#include <array>
#include <utility>

std::vector<std::pair<int, std::string>> byAge = {{30, "cy"}, {25, "ana"}, {30, "ben"}};
std::sort(byAge.begin(), byAge.end());
for (const auto& [age, name] : byAge) std::cout << age << name << ' ';  // 25ana 30ben 30cy
std::cout << '\n';
std::sort(byAge.begin(), byAge.end(), [](const auto& a, const auto& b) {
    return a.second < b.second;                   // by the second item only
});
for (const auto& [age, name] : byAge) std::cout << name << ' ';        // ana ben cy
std::cout << '\n';

std::vector<std::array<int, 2>> points = {{2, 5}, {1, 9}, {2, 1}};
std::sort(points.begin(), points.end());
for (const auto& p : points) std::cout << p[0] << ',' << p[1] << ' ';  // 1,9 2,1 2,5
```

### Intervals by start: meeting rooms and merge intervals

```cpp
std::vector<std::vector<int>> intervals = {{8, 10}, {1, 3}, {2, 6}, {15, 18}};
std::sort(intervals.begin(), intervals.end(), [](const std::vector<int>& a, const std::vector<int>& b) {
    return a[0] < b[0];                           // by start
});
bool canAttendAll = true;
for (std::size_t i = 1; i < intervals.size(); i++) {
    if (intervals[i][0] < intervals[i - 1][1]) canAttendAll = false;
}
std::cout << std::boolalpha << canAttendAll << '\n';   // false, [2,6] starts inside [1,3]

std::vector<std::vector<int>> merged;
for (const auto& cur : intervals) {
    if (merged.empty() || merged.back()[1] < cur[0]) {
        merged.push_back(cur);                    // no overlap: start a new one
    } else {
        merged.back()[1] = std::max(merged.back()[1], cur[1]);  // overlap: stretch the last
    }
}
for (const auto& m : merged) std::cout << '[' << m[0] << ',' << m[1] << "] ";  // [1,6] [8,10] [15,18]
```

### Structs

```cpp
struct Player {
    std::string name;
    int score;
    bool operator<(const Player& other) const {   // the default order for std::sort
        return name < other.name;
    }
};

std::vector<Player> players = {{"cy", 90}, {"ana", 95}, {"bo", 90}};
std::sort(players.begin(), players.end());        // uses operator<
for (const auto& p : players) std::cout << p.name << ' ';   // ana bo cy
std::cout << '\n';
std::sort(players.begin(), players.end(), [](const Player& a, const Player& b) {
    if (a.score != b.score) return a.score > b.score;       // high score first
    return a.name < b.name;                                 // ties: name A to Z
});
for (const auto& p : players) std::cout << p.name << p.score << ' ';  // ana95 bo90 cy90
```

### A map's entries by value

A map is always ordered by key. Copy its entries into a vector of pairs, then sort that.

```cpp
#include <unordered_map>

std::vector<std::string> text = {"the", "cat", "the", "a", "sat", "a", "the"};
std::unordered_map<std::string, int> counts;
for (const auto& w : text) counts[w]++;
std::vector<std::pair<std::string, int>> entries(counts.begin(), counts.end());
std::sort(entries.begin(), entries.end(), [](const auto& a, const auto& b) {
    if (a.second != b.second) return a.second > b.second;   // count, high first
    return a.first < b.first;                               // then word, A to Z
});
for (const auto& [word, n] : entries) std::cout << word << '=' << n << ' ';  // the=3 a=2 cat=1 sat=1
```

### A custom order: the largest concatenated number

```cpp
std::vector<int> nums = {3, 30, 34, 5, 9};
std::vector<std::string> parts;
for (int x : nums) parts.push_back(std::to_string(x));
std::sort(parts.begin(), parts.end(), [](const std::string& x, const std::string& y) {
    return x + y > y + x;                       // "9" + "5" beats "5" + "9"
});
std::string joined;
for (const auto& p : parts) joined += p;
std::cout << (joined[0] == '0' ? "0" : joined) << '\n';   // 9534330, and "0" for all zeros
```

### Indexes by value, reverse, nth_element, partial_sort

```cpp
#include <numeric>   // std::iota

std::vector<int> v = {7, 2, 9, 4, 1, 8};
std::vector<int> idx(v.size());
std::iota(idx.begin(), idx.end(), 0);            // counts up from 0
std::sort(idx.begin(), idx.end(), [&](int i, int j) { return v[i] < v[j]; });
for (int i : idx) std::cout << i << ' ';         // 4 1 3 0 5 2, where each value sits
std::cout << '\n';

std::reverse(v.begin(), v.end());
for (int x : v) std::cout << x << ' ';           // 8 1 4 9 2 7
std::cout << '\n';
std::nth_element(v.begin(), v.begin() + 2, v.end());   // O(n): index 2 gets what a full sort puts there
std::cout << v[2] << '\n';                       // 4, the 3rd smallest
std::partial_sort(v.begin(), v.begin() + 3, v.end());  // the 3 smallest, sorted, at the front
for (int i = 0; i < 3; i++) std::cout << v[i] << ' ';  // 1 2 4
std::cout << '\n' << std::boolalpha << std::is_sorted(v.begin(), v.end()) << '\n';  // false, only the front
```

### Merge sort (divide and conquer)

Sort each half, then merge the two sorted halves with two indexes.

```cpp
void mergeSort(std::vector<int>& a, int lo, int hi) {   // sorts a[lo] up to a[hi - 1]
    if (hi - lo < 2) return;
    int mid = lo + (hi - lo) / 2;
    mergeSort(a, lo, mid);
    mergeSort(a, mid, hi);
    std::vector<int> merged;
    int i = lo, j = mid;
    while (i < mid || j < hi) {
        if (j == hi || (i < mid && a[i] <= a[j])) merged.push_back(a[i++]);  // <= keeps it stable
        else merged.push_back(a[j++]);
    }
    std::copy(merged.begin(), merged.end(), a.begin() + lo);
}

std::vector<int> a = {5, 2, 9, 1, 7};
mergeSort(a, 0, static_cast<int>(a.size()));
for (int x : a) std::cout << x << ' ';            // 1 2 5 7 9
```

`std::merge(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(out))` merges two sorted ranges for you.

### Sweep line: rooms in use at once

Sort the starts and the ends on their own, then walk the starts. A meeting that ends at 10 frees its room for one that starts at 10.

```cpp
std::vector<std::vector<int>> meetings = {{0, 30}, {5, 10}, {15, 20}, {10, 15}};
std::vector<int> starts, ends;
for (const auto& m : meetings) {
    starts.push_back(m[0]);
    ends.push_back(m[1]);
}
std::sort(starts.begin(), starts.end());
std::sort(ends.begin(), ends.end());
int rooms = 0;
std::size_t e = 0;
for (int s : starts) {
    if (s >= ends[e]) e++;    // a room freed up, reuse it
    else rooms++;             // every room is busy, open one more
}
std::cout << rooms << '\n';  // 2
```

### Calls

| Call | Does |
|---|---|
| `std::sort(b, e)` | ascending, O(n log n), not stable |
| `std::sort(b, e, cmp)` | `cmp(x, y)` is true when `x` goes first |
| `std::stable_sort(b, e, cmp)` | keeps ties in their earlier order |
| `std::greater<>()` | the descending comparator, from `<functional>` |
| `std::reverse(b, e)` | reverse in place |
| `std::partial_sort(b, m, e)` | the smallest `m - b` items, sorted, at the front |
| `std::nth_element(b, n, e)` | the right item at `n`, smaller ones before it, O(n) average |
| `std::is_sorted(b, e)` | whether it's already sorted |

### Gotchas

- A comparator must be a strict weak ordering: use `<` or `>`, never `<=`. With `<=`, `std::sort` can run past the end of the vector and crash when many values are equal.
- `std::sort` isn't stable, so ties come out in any order. Break them with a second key, or use `std::stable_sort`, whenever the output must be exact.
- `std::unordered_map` iterates in no fixed order. Copy its entries into a vector and sort before you print.
- Take elements by `const&` in a comparator. `[](std::vector<int> a, std::vector<int> b)` copies two vectors on every comparison.
