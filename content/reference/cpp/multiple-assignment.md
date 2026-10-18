# Multiple Assignment

C++ has no `a, b = 1, 2`. You declare several variables in one statement, chain `=`, or unpack a pair, tuple, or array with C++17 structured bindings (`auto [a, b] = ...`).

### Several variables in one line

```cpp
int a = 1, b = 2, c = 3;
double x = 0.5, y = 1.5;
int i = 0, j;      // only i is initialized, j holds garbage
j = 10;
```

### Chain the same value

```cpp
int a, b, c;
a = b = c = 0;     // = runs right to left, all three are 0
```

### Unpack with structured bindings

```cpp
#include <iostream>
#include <string>
#include <tuple>
#include <utility>

auto [x, y] = std::pair<int, int>(3, 4);                    // x=3, y=4
auto [id, name, score] = std::make_tuple(7, std::string("Ada"), 9.5);

int arr[3] = {10, 20, 30};
auto [p, q, r] = arr;                                       // p=10, q=20, r=30

std::cout << x + y << ' ' << name << ' ' << q << '\n';      // 7 Ada 20
```

### Assign to existing variables

```cpp
#include <tuple>

int a = 1, b = 2;
std::tie(a, b) = std::make_tuple(b, a);   // a=2, b=1

int lo;
std::tie(lo, std::ignore) = std::make_pair(5, 99);   // lo=5, second is dropped
```

### Swap

```cpp
#include <utility>

int a = 1, b = 2;
std::swap(a, b);   // a=2, b=1
```

To return several values from a function, return a `std::pair`, `std::tuple`, or struct and unpack it (see Functions).

### Use it in a loop

```cpp
#include <map>
#include <string>
#include <utility>
#include <vector>

std::map<std::string, int> ages = {{"Ann", 31}, {"Bob", 25}};
for (const auto& [name, age] : ages) {
    std::cout << name << '=' << age << ' ';
}
std::cout << '\n';   // Ann=31 Bob=25

std::vector<std::pair<int, char>> v = {{1, 'a'}, {2, 'b'}};
for (auto [n, ch] : v) {
    std::cout << n << ch << ' ';
}
std::cout << '\n';   // 1a 2b

for (int i = 0, j = 4; i < j; i++, j--) {
    std::cout << i << j << ' ';
}
std::cout << '\n';   // 04 13
```

| Call | Does |
|---|---|
| `auto [a, b] = pair;` | new variables from a pair, tuple, array, or struct |
| `auto& [a, b] = pair;` | bind by reference, writes go back to the source |
| `std::tie(a, b) = tuple;` | assign into variables that already exist (`<tuple>`) |
| `std::ignore` | skip one slot in `std::tie` |
| `std::swap(a, b)` | swap two values (`<utility>`) |

### Gotchas

- `int a, b = 0;` sets only `b`. Write `int a = 0, b = 0;`.
- `int* p, q;` makes `p` a pointer and `q` a plain `int`.
- Structured bindings always declare new names. To overwrite existing variables use `std::tie`.
- The number of names must match the size exactly, and there is no `_` placeholder in C++17.
