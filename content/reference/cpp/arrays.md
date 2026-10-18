# Vectors and Arrays

Reach for `std::vector` from `<vector>`: a dynamic array that grows as you `push_back`. Fixed-size options are `std::array` from `<array>` and the plain C array `int a[5]`, whose size never changes.

### Create a vector

```cpp
#include <string>
#include <vector>

std::vector<int> empty;                   // {}
std::vector<int> v = {3, 1, 4};           // {3, 1, 4}
std::vector<int> zeros(5);                // {0, 0, 0, 0, 0}
std::vector<int> sevens(3, 7);            // {7, 7, 7}
std::vector<std::string> names = {"ann", "bo"};
std::vector<int> copy = v;                // a full, independent copy
```

### Add and remove

```cpp
std::vector<int> v = {3, 1, 4};
v.push_back(5);                     // {3, 1, 4, 5}
v.insert(v.begin(), 9);             // {9, 3, 1, 4, 5}
v.insert(v.begin() + 2, 8);         // {9, 3, 8, 1, 4, 5}
v.pop_back();                       // {9, 3, 8, 1, 4}
v.erase(v.begin());                 // {3, 8, 1, 4}
v.erase(v.begin() + 1);             // {3, 1, 4}, removes index 1
v.erase(v.begin(), v.begin() + 2);  // {4}, removes indexes 0 and 1
v.clear();                          // {}
v.resize(3);                        // {0, 0, 0}
```

### Access

```cpp
#include <iostream>

std::vector<int> v = {3, 1, 4};
std::cout << v[0] << '\n';                         // 3, no bounds check
std::cout << v.at(1) << '\n';                      // 1, throws std::out_of_range if bad
std::cout << v.front() << ' ' << v.back() << '\n'; // 3 4
std::cout << v.size() << ' ' << v.empty() << '\n'; // 3 0
v[2] = 10;                                         // {3, 1, 10}
```

### Sort and search

```cpp
#include <algorithm>    // sort, find, count, reverse
#include <functional>   // std::greater

std::vector<int> v = {5, 2, 8, 2};
std::sort(v.begin(), v.end());                       // {2, 2, 5, 8}
std::sort(v.begin(), v.end(), std::greater<int>());  // {8, 5, 2, 2}
std::reverse(v.begin(), v.end());                    // {2, 2, 5, 8}

auto it = std::find(v.begin(), v.end(), 5);
if (it != v.end()) {
    std::cout << "at index " << (it - v.begin()) << '\n';  // at index 2
}
std::count(v.begin(), v.end(), 2);                   // 2
```

Sum, min, and max of a vector are in Built-in Functions. More algorithms (`unique`, `remove_if`, `transform`) are in Standard Library.

### Use it in a loop

```cpp
std::vector<int> squares;
for (int i = 1; i <= 4; i++) {
    squares.push_back(i * i);
}
for (int s : squares) {
    std::cout << s << ' ';        // 1 4 9 16
}
```

### std::array and C arrays

```cpp
#include <array>
#include <iterator>   // std::size, std::begin, std::end

std::array<int, 3> arr = {1, 2, 3};  // size is part of the type
arr.size();                          // 3
arr.fill(0);                         // {0, 0, 0}

int c[5] = {1, 2, 3};                // {1, 2, 3, 0, 0}, the rest are 0
int d[4] = {};                       // all zeros
std::size(c);                        // 5 (C++17)
sizeof(c) / sizeof(c[0]);            // 5, the old way
std::vector<int> fromC(std::begin(c), std::end(c));  // C array to vector
```

| Call | Does |
|---|---|
| `v.push_back(x)` | add to the end |
| `v.emplace_back(args)` | build a new element in place at the end |
| `v.pop_back()` | remove the last (returns nothing) |
| `v.insert(v.begin() + i, x)` | insert at index `i` |
| `v.erase(v.begin() + i)` | remove index `i` |
| `v.size()` / `v.empty()` | count / is it empty |
| `v.front()` / `v.back()` | first / last element |
| `v.clear()` / `v.resize(n)` | empty it / set its length |
| `v.reserve(n)` | make room for `n` without changing the size |
| `a == b` | same length and elements |

### Gotchas

- `v[i]` with a bad index is undefined behavior, not an error. Use `v.at(i)` when you want the check.
- `std::vector<int> v(5)` is five zeros, `std::vector<int> v{5}` is one element, 5.
- `v.size()` is unsigned, so `v.size() - 1` on an empty vector is a huge number, not -1.
- `std::cout << v` doesn't compile. Print the elements in a loop.
