# Maps

C++ has two maps. `std::map` keeps keys sorted (a balanced tree, O(log n)), and `std::unordered_map` is a hash table (O(1) average, no order). The one thing to know first: `m[key]` *inserts* a default value when the key is missing.

### Create

```cpp
#include <map>
#include <unordered_map>
#include <string>
#include <vector>

std::map<std::string, int> ages = {{"ana", 31}, {"bo", 25}};
std::unordered_map<std::string, int> counts;
std::cout << counts.size() << '\n';             // 0, empty
std::map<int, std::vector<std::string>> groups; // value can be any type
```

### Add and update

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::map<std::string, int> ages = {{"ana", 31}, {"bo", 25}};
    std::unordered_map<std::string, int> counts;
    {{code}}
    for (const auto& [k, v] : ages) std::cout << k << '=' << v << ' ';
    std::cout << '\n' << counts["x"] << '\n';
}
```

```cpp
ages["cy"] = 40;                 // insert or overwrite
ages.insert({"dee", 22});        // only inserts if the key is new
ages.emplace("eve", 28);         // same, builds the pair in place
ages.insert_or_assign("ana", 32); // insert or overwrite (C++17)
ages.try_emplace("bo", 99);      // key exists, so nothing happens
counts["x"]++;                   // missing key starts at 0, now 1
```

### Access and check

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::map<std::string, int> ages = {{"ana", 32}, {"bo", 25}, {"cy", 40}, {"dee", 22}, {"eve", 28}};
    {{code}}
}
```

```cpp
#include <iostream>

std::cout << std::boolalpha;
std::cout << ages["ana"] << '\n';        // 32, but inserts 0 if "ana" is missing
std::cout << ages.at("bo") << '\n';      // 25, throws std::out_of_range if missing

std::cout << ages.count("cy") << '\n';   // 1 if present, 0 if not

auto it = ages.find("zed");              // look up without inserting
if (it != ages.end()) {
    std::cout << it->first << ' ' << it->second;
}

std::cout << ages.size() << '\n';        // 5
std::cout << ages.empty() << '\n';       // false
```

### Remove

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::map<std::string, int> ages = {{"ana", 32}, {"bo", 25}, {"cy", 40}, {"dee", 22}, {"eve", 28}};
    {{code}}
    std::cout << ages.size() << '\n';
}
```

```cpp
ages.erase("dee");   // by key, returns how many were removed (0 or 1)
ages.erase(ages.begin()); // by iterator
ages.clear();        // remove everything
```

### Loop

```cpp
std::map<std::string, int> stock = {{"pear", 3}, {"apple", 5}};

for (const auto& [name, qty] : stock) {   // structured bindings (C++17)
    std::cout << name << ": " << qty << '\n';
}
// apple: 5
// pear: 3      (std::map is sorted by key)

for (auto& [name, qty] : stock) qty *= 2; // auto& to modify values
```

### Count things in a loop

```cpp
std::string text = "banana";
std::map<char, int> freq;
for (char c : text) freq[c]++;
for (const auto& [c, n] : freq) std::cout << c << '=' << n << ' ';
// a=3 b=1 n=2
```

### Erase while looping

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::map<std::string, int> stock = {{"pear", 3}, {"apple", 5}};
    {{code}}
    for (const auto& [name, qty] : stock) std::cout << name << ": " << qty << '\n';
}
```

```cpp
for (auto it = stock.begin(); it != stock.end(); ) {
    if (it->second < 5) it = stock.erase(it); // erase returns the next iterator
    else ++it;
}
```

### Sort by value

A map is always ordered by key. To order by value, copy the entries into a vector of pairs and sort that.

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    {{code}}
}
```

```cpp
#include <algorithm>
#include <utility>

std::map<std::string, int> score = {{"ana", 7}, {"bo", 9}, {"cy", 4}};
std::vector<std::pair<std::string, int>> byScore(score.begin(), score.end());
std::sort(byScore.begin(), byScore.end(), [](const auto& a, const auto& b) {
    return a.second > b.second;          // highest first
});
for (const auto& [k, v] : byScore) std::cout << k << '=' << v << ' ';  // bo=9 ana=7 cy=4
```

### Sorted map extras

```cpp
#include <functional>  // std::greater

std::map<int, std::string> m = {{10, "a"}, {20, "b"}, {30, "c"}};
std::cout << m.begin()->first << '\n';           // 10, smallest key
std::cout << m.rbegin()->first << '\n';          // 30, largest key
std::cout << m.lower_bound(15)->first << '\n';   // 20, first key >= 15
std::cout << m.upper_bound(20)->first << '\n';   // 30, first key > 20

std::map<int, int, std::greater<int>> desc; // sorted largest first
```

| Call | Does |
|---|---|
| `m[k]` | get or insert default, returns a reference |
| `m.at(k)` | get, throws `std::out_of_range` if missing |
| `m.find(k)` | iterator to the entry, or `m.end()` |
| `m.count(k)` | 1 or 0 |
| `m.insert({k, v})` | add if the key is new |
| `m.insert_or_assign(k, v)` | add or overwrite |
| `m.erase(k)` | remove by key |
| `m.size()` / `m.empty()` | how many / is it empty |

### Gotchas

- Reading `m[k]` on a missing key adds it. Use `find` or `count` to check without changing the map.
- `m[k]` doesn't compile on a `const` map. Use `at` or `find` there.
- `map::contains` is C++20 and not available here. Use `count(k)` or `find(k) != end()`.
- `std::unordered_map` has no order, so its loop order can look random. Use `std::map` when you print or need sorted keys.
