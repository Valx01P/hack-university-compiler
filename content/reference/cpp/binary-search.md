# Binary Search

Binary search halves a sorted range at every step, so a million values take about 20 looks. `<algorithm>` has it built in: `std::binary_search` answers yes or no, and `std::lower_bound` and `std::upper_bound` return an iterator to where a value is or would go. Subtract `begin()` to get an index.

### Built-in search on a vector

```cpp
#include <algorithm>
#include <vector>

std::vector<int> v = {1, 3, 3, 3, 5, 8};
std::cout << std::boolalpha;
std::cout << std::binary_search(v.begin(), v.end(), 5) << '\n';   // true
std::cout << std::binary_search(v.begin(), v.end(), 4) << '\n';   // false

auto lo = std::lower_bound(v.begin(), v.end(), 3);   // first value >= 3
auto hi = std::upper_bound(v.begin(), v.end(), 3);   // first value > 3
std::cout << (lo - v.begin()) << ' ' << (hi - v.begin()) << '\n';   // 1 4
std::cout << (hi - lo) << '\n';                                    // 3, how many 3s

auto it = std::lower_bound(v.begin(), v.end(), 4);
std::cout << (it - v.begin()) << '\n';               // 4, where 4 would go (search insert position)
auto past = std::lower_bound(v.begin(), v.end(), 99);
std::cout << (past == v.end()) << '\n';              // true, so never read *past

auto [first, last] = std::equal_range(v.begin(), v.end(), 3);  // both bounds at once
std::cout << (first - v.begin()) << ' ' << (last - v.begin()) << '\n';   // 1 4
```

On a vector sorted from high to low, pass the same comparator it was sorted with: `std::lower_bound(v.begin(), v.end(), x, std::greater<>())`.

### First and last position

```cpp
std::vector<int> v = {5, 7, 7, 8, 8, 10};
int target = 8;
auto lo = std::lower_bound(v.begin(), v.end(), target);
if (lo == v.end() || *lo != target) {
    std::cout << "-1 -1\n";
} else {
    auto hi = std::upper_bound(v.begin(), v.end(), target);
    std::cout << (lo - v.begin()) << ' ' << (hi - v.begin() - 1) << '\n';   // 3 4
}
```

### Set and map members

A `std::set` and a `std::map` have their own `lower_bound` and `upper_bound`, O(log n). The free `std::lower_bound` on a set is O(n), so call the member.

```cpp
#include <iterator>   // std::prev
#include <map>
#include <set>

std::set<int> s = {10, 20, 30};
std::cout << *s.lower_bound(15) << '\n';      // 20, smallest >= 15
std::cout << *s.upper_bound(20) << '\n';      // 30, smallest > 20
auto it = s.upper_bound(25);
if (it != s.begin()) {
    std::cout << *std::prev(it) << '\n';      // 20, largest <= 25 (the floor)
}
std::cout << (s.lower_bound(31) == s.end()) << '\n';   // 1, nothing that big

std::map<int, std::string> at = {{1, "bar"}, {4, "baz"}};   // time to value
auto later = at.upper_bound(3);               // first time after 3
if (later != at.begin()) {
    std::cout << std::prev(later)->second << '\n';      // bar, the latest at or before 3
}
std::cout << at.lower_bound(4)->first << '\n';          // 4
```

That last pattern is the time-based key-value store: keep a `std::map<int, std::string>` per key and ask for the latest time at or before the query.

### By hand: an exact match

```cpp
int search(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;   // int, so hi can reach -1
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;                   // never (lo + hi) / 2, it can overflow
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

std::vector<int> a = {2, 4, 7, 9, 12};
std::cout << search(a, 9) << ' ' << search(a, 5) << '\n';   // 3 -1
```

### By hand: lower bound

The half-open template: `hi` starts one past the end and the loop runs while `lo < hi`. It returns the first index where the condition turns true, or `a.size()` when it never does.

```cpp
int lowerBound(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1;   // mid is too small: the answer is after it
        else hi = mid;                       // mid might be the answer: keep it
    }
    return lo;
}

std::vector<int> a = {1, 2, 2, 2, 5};
std::cout << lowerBound(a, 2) << ' ' << lowerBound(a, 3) << ' ' << lowerBound(a, 9) << '\n';  // 1 4 5
```

For the upper bound, write `a[mid] <= target` in the `if`.

### Binary search on the answer

When a guess `x` either works or doesn't, and every bigger guess works too, binary search the smallest `x` that works. Koko eats bananas at speed `k` and needs `ceil(pile / k)` hours per pile: find the slowest speed that finishes in `h` hours.

```cpp
bool canFinish(const std::vector<int>& piles, long long k, long long h) {
    long long hours = 0;
    for (int p : piles) hours += (p + k - 1) / k;   // ceiling division without floats
    return hours <= h;
}

std::vector<int> piles = {3, 6, 7, 11};
long long lo = 1, hi = *std::max_element(piles.begin(), piles.end());
while (lo < hi) {
    long long mid = lo + (hi - lo) / 2;
    if (canFinish(piles, mid, 8)) hi = mid;   // works: try slower
    else lo = mid + 1;                        // too slow: go faster
}
std::cout << lo << '\n';   // 4
```

### Search a rotated sorted array

One half of any range is always sorted. Check whether the target sits inside that half, and keep the half that can hold it.

```cpp
int searchRotated(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[lo] <= a[mid]) {                                   // the left half is sorted
            if (a[lo] <= target && target < a[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                                                 // the right half is sorted
            if (a[mid] < target && target <= a[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}

int findMin(const std::vector<int>& a) {   // the smallest value, where the rotation starts
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] > a[hi]) lo = mid + 1;   // the drop is to the right of mid
        else hi = mid;
    }
    return a[lo];
}

std::vector<int> a = {4, 5, 6, 7, 0, 1, 2};
std::cout << searchRotated(a, 0) << ' ' << searchRotated(a, 3) << '\n';   // 4 -1
std::cout << findMin(a) << '\n';                                          // 0
```

### Calls

| Call | Returns |
|---|---|
| `std::binary_search(b, e, x)` | `bool`, whether `x` is there |
| `std::lower_bound(b, e, x)` | iterator to the first value `>= x`, or `e` |
| `std::upper_bound(b, e, x)` | iterator to the first value `> x`, or `e` |
| `std::equal_range(b, e, x)` | both, as a pair |
| `it - v.begin()` | the index of an iterator |
| `s.lower_bound(x)`, `m.upper_bound(k)` | the member versions, O(log n) on a set or map |
| `std::prev(it)` | the element before, for "largest at or before" |

### Gotchas

- The range must be sorted by the same order you search with. On unsorted data the calls return nonsense without any error.
- `lower_bound` returns `end()` when every value is smaller. Check before you dereference it.
- Write `mid = lo + (hi - lo) / 2`. With `int` bounds near 2 billion, `lo + hi` overflows.
- Keep `lo` and `hi` as `int` (or `long long`), not `std::size_t`. `hi = mid - 1` at `mid == 0` wraps an unsigned index to a huge number.
