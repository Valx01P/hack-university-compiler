# Looping Over Arrays

Use the range-based `for (int x : v)` when you only need the values, and an index loop when you need the position too. Both work on `std::vector`, `std::array`, and plain C arrays.

### Index loop

```cpp
#include <iostream>
#include <string>
#include <vector>

std::vector<int> v = {4, 7, 1, 9};
for (std::size_t i = 0; i < v.size(); i++) {
    std::cout << i << ':' << v[i] << ' ';     // 0:4 1:7 2:1 3:9
}
```

### Range-based loop

```cpp
for (int x : v) {
    std::cout << x << ' ';                    // 4 7 1 9
}

for (int& x : v) {
    x += 1;                                   // v is now {5, 8, 2, 10}
}

std::vector<std::string> names = {"ann", "bo"};
for (const std::string& n : names) { }        // const& skips copying each string
```

### while loop

```cpp
std::size_t i = 0;
while (i < v.size()) {
    std::cout << v[i] << ' ';                 // 4 7 1 9
    i++;
}
```

### Iterators

```cpp
for (auto it = v.begin(); it != v.end(); ++it) {
    std::cout << *it << ' ';                  // 4 7 1 9
}
```

### Index and value together

There is no `enumerate`. Keep a counter, or use the index loop.

```cpp
int idx = 0;
for (int x : v) {
    std::cout << idx << '=' << x << ' ';      // 0=4 1=7 2=1 3=9
    idx++;
}
```

### C arrays

```cpp
#include <iterator>   // std::size

int arr[] = {2, 4, 6};
for (int x : arr) {
    std::cout << x << ' ';                    // 2 4 6
}
for (std::size_t j = 0; j < std::size(arr); j++) {
    std::cout << arr[j] << ' ';               // 2 4 6
}
```

### Sum, max, count in one pass

```cpp
std::vector<int> v = {4, 7, 1, 9};
int sum = 0, best = v[0], evens = 0;
for (int x : v) {
    sum += x;
    if (x > best) best = x;
    if (x % 2 == 0) evens++;
}
// sum 21, best 9, evens 1
```

### Filter into a new vector

```cpp
std::vector<int> big;
for (int x : v) {
    if (x > 3) big.push_back(x);              // {4, 7, 9}
}
```

### Print with separators

```cpp
for (std::size_t k = 0; k < v.size(); k++) {
    if (k > 0) std::cout << ", ";
    std::cout << v[k];                        // 4, 7, 1, 9
}
```

### Find the first match

```cpp
int pos = -1;
for (int k = 0; k < (int)v.size(); k++) {
    if (v[k] == 1) {
        pos = k;
        break;
    }
}
// pos is 2
```

### Remove while looping

```cpp
std::vector<int> w = {1, 2, 3, 4, 5, 6};
for (std::size_t k = 0; k < w.size(); ) {
    if (w[k] % 2 == 0) {
        w.erase(w.begin() + k);               // do not advance after erase
    } else {
        k++;
    }
}
// w is {1, 3, 5}
```

The one-line version, the erase-remove idiom, is in Standard Library.

| Loop | Use when |
|---|---|
| `for (int x : v)` | read each value |
| `for (int& x : v)` | change each value |
| `for (const auto& x : v)` | read big items (strings, vectors) |
| `for (std::size_t i = 0; i < v.size(); i++)` | you need the index |
| `while (i < v.size())` | the step varies or you stop early |

### Gotchas

- `for (int x : v) x = 0;` changes copies. Write `int& x` to change `v`.
- Erasing or `push_back` inside a range-based loop breaks it. Use an index loop or erase-remove.
- A C array passed to a function decays to a pointer, so range-for and `std::size` no longer work there. Pass a `std::vector` instead.
