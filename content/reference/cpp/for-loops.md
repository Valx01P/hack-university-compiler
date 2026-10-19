# For Loops

C++ has two `for` loops: the classic three-part `for (init; condition; step)` for counting, and the range-based `for (x : container)` for walking every element of a vector, string, map, or braced list.

### Count

```cpp
#include <iostream>

for (int i = 0; i < 5; i++) {
    std::cout << i << ' ';        // 0 1 2 3 4
}
std::cout << '\n';

for (int i = 5; i > 0; i--) std::cout << i << ' ';        // 5 4 3 2 1
std::cout << '\n';
for (int i = 0; i <= 10; i += 2) std::cout << i << ' ';   // 0 2 4 6 8 10
std::cout << '\n';
for (int i = 1; i < 100; i *= 2) std::cout << i << ' ';   // 1 2 4 8 16 32 64
```

### Range-based for

```cpp
#include <map>
#include <string>
#include <vector>

std::vector<int> nums = {3, 1, 4};
for (int n : nums) {
    std::cout << n << ' ';        // 3 1 4
}

for (int& n : nums) {
    n *= 2;                       // & edits the real element
}
for (int n : nums) std::cout << n << ' ';   // 6 2 8

std::vector<std::string> words = {"hi", "yo"};
for (const auto& w : words) {     // read-only, no copy
    std::cout << w << ' ';        // hi yo
}

for (int x : {10, 20, 30}) {      // a braced list works too
    std::cout << x << ' ';        // 10 20 30
}

std::map<std::string, int> ages = {{"ann", 31}, {"bo", 25}};
for (const auto& [name, age] : ages) {        // structured bindings (C++17)
    std::cout << name << '=' << age << ' ';   // ann=31 bo=25
}
```

### Two variables at once

```cpp
for (int i = 0, j = 4; i < j; i++, j--) {
    std::cout << i << ',' << j << ' ';        // 0,4 1,3
}
```

### break and continue

```cpp
for (int i = 0; i < 10; i++) {
    if (i % 2 == 0) continue;     // skip to the next i
    if (i > 7) break;             // leave the loop
    std::cout << i << ' ';        // 1 3 5 7
}
```

### Nested loops

```cpp
for (int r = 1; r <= 3; r++) {
    for (int c = 1; c <= 3; c++) {
        std::cout << r * c << ' ';
    }
    std::cout << '\n';
}
// 1 2 3
// 2 4 6
// 3 6 9
```

C++ has no labeled break. To leave both loops, use a flag in the outer condition (or move the loops into a function and `return`).

```cpp
bool found = false;
for (int r = 0; r < 3 && !found; r++) {
    for (int c = 0; c < 3; c++) {
        if (r * c == 2) {
            found = true;
            break;                // leaves the inner loop only
        }
    }
}
std::cout << std::boolalpha << found << '\n';   // true
```

### Forms

| Form | Does |
|---|---|
| `for (int i = 0; i < n; i++)` | count 0 to n-1 |
| `for (int i = n - 1; i >= 0; i--)` | count down to 0 |
| `for (auto x : v)` | each element, as a copy |
| `for (auto& x : v)` | each element, editable |
| `for (const auto& x : v)` | each element, read-only, no copy |
| `for (;;)` | loop forever, leave with `break` |

### Gotchas

- Range-based `for (auto x : v)` copies each element, so changing `x` does not change `v`. Use `auto&` to edit.
- `i < v.size()` compares a signed `int` with an unsigned `size_t` (a warning). Use `std::size_t i` or `(int)v.size()`.
- Never `push_back` into a vector while range-for looping over it. The vector can reallocate and the loop reads freed memory.
- A stray semicolon, `for (int i = 0; i < 3; i++);`, gives the loop an empty body.
