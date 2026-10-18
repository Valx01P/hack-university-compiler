# Tuples and Pairs

`std::pair` holds two values (`.first`, `.second`) and `std::tuple` holds any fixed number. Both are fixed size and can mix types. Unpack either one with structured bindings: `auto [a, b] = p;`.

### Pair

```cpp
#include <utility>
#include <string>

std::pair<std::string, int> p = {"ana", 31};
auto q = std::make_pair("bo", 25);   // type deduced
std::pair r("cy", 40);               // C++17 deduces the types too

p.first;          // "ana"
p.second;         // 31
p.second = 32;    // members are writable
```

### Tuple

```cpp
#include <tuple>

std::tuple<std::string, int, double> t = {"ana", 31, 1.68};
auto u = std::make_tuple(1, 'x', true);

std::get<0>(t);           // "ana"
std::get<2>(t) = 1.70;    // write by index
std::get<int>(t);         // 31, by type (only if the type appears once)
std::tuple_size_v<decltype(t)>;        // 3
```

### Unpack

```cpp
auto [name, age] = p;                 // copies
auto& [n2, a2] = p;                   // references, edits change p
auto [who, years, height] = t;
```

`std::tie` for variables that already exist is in Multiple Assignment. Returning several values from a function is in Functions.

### Use it in a loop

```cpp
#include <iostream>
#include <map>
#include <vector>

std::vector<std::pair<std::string, int>> scores = {{"ana", 90}, {"bo", 75}};
scores.push_back({"cy", 82});
scores.emplace_back("dee", 60);

for (const auto& [name, score] : scores) {
    std::cout << name << ' ' << score << '\n';
}

// Looping a std::map gives you pairs too
std::map<std::string, int> ages = {{"ana", 31}, {"bo", 25}};
for (const auto& kv : ages) {
    std::cout << kv.first << '=' << kv.second << '\n';
}
```

### Compare and sort

Pairs and tuples compare element by element, left to right. That makes sorting by several keys easy.

```cpp
#include <algorithm>

std::pair<int, int> a = {1, 5}, b = {1, 7};
a < b;     // true (first equal, then 5 < 7)
a == b;    // false

std::vector<std::pair<int, std::string>> v = {{2, "b"}, {1, "z"}, {2, "a"}};
std::sort(v.begin(), v.end());
// {1, "z"}, {2, "a"}, {2, "b"}

// sort by score descending, then name ascending
std::sort(scores.begin(), scores.end(), [](const auto& x, const auto& y) {
    return std::make_tuple(-x.second, x.first) < std::make_tuple(-y.second, y.first);
});
```

| Call | Does |
|---|---|
| `std::make_pair(a, b)` | build a pair |
| `std::make_tuple(a, b, c)` | build a tuple |
| `std::get<i>(t)` | element `i` (a compile-time number) |
| `std::tie(x, y) = t` | unpack into existing variables |
| `std::tuple_size_v<T>` | number of elements |

### Gotchas

- The index in `std::get<i>` must be a constant. You can't loop over a tuple with a normal `for` and `std::get<i>`.
- `auto [a, b] = p` copies. Write `auto& [a, b]` to change the original.
- `std::make_pair("bo", 25)` makes a `pair<const char*, int>`, not a `std::string`. Spell out the type when that matters.
- For more than three fields, a small `struct` with named members reads better than `std::get<3>`.
