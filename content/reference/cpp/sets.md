# Sets

A set holds each value once. `std::set` keeps values sorted (O(log n)), `std::unordered_set` is a hash set (O(1) average, no order). Adding a value that is already there does nothing.

### Create

```cpp
#include <set>
#include <unordered_set>
#include <string>
#include <vector>

std::set<int> s = {3, 1, 4, 1, 5};       // {1, 3, 4, 5}
std::unordered_set<std::string> seen;    // empty

std::vector<int> v = {2, 2, 7, 7, 9};
std::set<int> uniq(v.begin(), v.end());  // {2, 7, 9}
```

### Add and remove

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::set<int> s = {3, 1, 4, 1, 5};
    {{code}}
    std::cout << std::boolalpha << added << ' ' << s.size() << '\n';
}
```

```cpp
s.insert(9);            // {1, 3, 4, 5, 9}
s.insert(3);            // already there, no change

auto [it, added] = s.insert(2);  // added is true if it was new

s.erase(4);             // by value, returns 1 if removed, 0 if not
s.clear();
```

### Check membership

```cpp
std::set<int> s = {1, 3, 5};
if (s.count(3)) { }             // 1 if present, 0 if not
if (s.find(4) == s.end()) { }   // not found
s.size();                       // 3
```

### Loop

```cpp
#include <iostream>

std::set<std::string> tags = {"red", "blue", "green"};
for (const std::string& t : tags) {
    std::cout << t << ' ';
}
// blue green red   (sorted)
```

### Spot duplicates in a loop

```cpp
std::vector<int> nums = {4, 2, 4, 1, 2};
std::set<int> seen;
for (int n : nums) {
    if (!seen.insert(n).second) {   // .second is false when n was already in
        std::cout << "dup " << n << '\n';
    }
}
// dup 4
// dup 2
```

### Union, intersection, difference

These need sorted ranges, so use `std::set` (not `unordered_set`).

```cpp
#include <algorithm>
#include <iterator>

std::set<int> a = {1, 2, 3, 4};
std::set<int> b = {3, 4, 5};
std::set<int> out;

std::set_union(a.begin(), a.end(), b.begin(), b.end(),
               std::inserter(out, out.begin()));          // {1, 2, 3, 4, 5}
out.clear();
std::set_intersection(a.begin(), a.end(), b.begin(), b.end(),
                      std::inserter(out, out.begin()));   // {3, 4}
out.clear();
std::set_difference(a.begin(), a.end(), b.begin(), b.end(),
                    std::inserter(out, out.begin()));     // {1, 2}
```

### Sorted set extras

```cpp
std::set<int> s = {10, 20, 30};
*s.begin();             // 10, smallest
*s.rbegin();            // 30, largest
*s.lower_bound(15);     // 20, first value >= 15
*s.upper_bound(20);     // 30, first value > 20

std::multiset<int> ms = {1, 1, 2};   // allows repeats
ms.count(1);                         // 2
ms.erase(ms.find(1));                // removes one copy (erase(1) removes all)
```

| Call | Does |
|---|---|
| `s.insert(x)` | add, returns `{iterator, bool added}` |
| `s.erase(x)` | remove by value |
| `s.count(x)` | 1 or 0 (a count in a `multiset`) |
| `s.find(x)` | iterator, or `s.end()` |
| `s.size()` / `s.empty()` | how many / is it empty |
| `s.lower_bound(x)` | first element >= x (sorted sets only) |

### Gotchas

- You can't change an element in place (`*it = 5` won't compile). Erase it and insert the new value.
- `set::contains` is C++20 and not available here. Use `count(x)`.
- `std::unordered_set` loops in no useful order. Use `std::set` when you print the values.
- `std::set_union` and friends give wrong results on unsorted input, so they don't work on `unordered_set`.
