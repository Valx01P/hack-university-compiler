# Infinity, NaN, and nullptr

Only floating-point types (`double`, `float`) have infinity and NaN. Integers have neither, so you use `INT_MAX` as a stand-in. "Null" is `nullptr` for pointers, and `std::optional` (C++17) for a value that may be missing.

### Infinity

```cpp
#include <iostream>
#include <limits>
#include <cmath>

double inf = std::numeric_limits<double>::infinity();
double ninf = -inf;
std::cout << inf << ' ' << ninf << '\n';             // inf -inf
std::cout << INFINITY << '\n';                       // inf, macro from <cmath>
std::cout << 1.0 / 0.0 << ' ' << inf + 1 << '\n';    // inf inf
std::cout << (inf > 1e308) << '\n';                  // 1
std::cout << std::isinf(ninf) << ' ' << std::isfinite(inf) << '\n';   // 1 0
```

### NaN (not a number)

```cpp
#include <limits>
#include <cmath>

double nan = std::numeric_limits<double>::quiet_NaN();
std::cout << nan << '\n';                       // nan
std::cout << std::sqrt(-1.0) << '\n';           // -nan
std::cout << (nan == nan) << '\n';              // 0, NaN never equals anything
std::cout << std::isnan(nan) << '\n';           // 1, the only reliable test
```

### Integer stand-ins for infinity

```cpp
#include <climits>
#include <limits>

std::cout << INT_MAX << '\n';                                 // 2147483647
std::cout << INT_MIN << '\n';                                 // -2147483648
std::cout << LLONG_MAX << '\n';                               // 9223372036854775807
std::cout << std::numeric_limits<int>::max() << '\n';         // 2147483647
std::cout << std::numeric_limits<double>::max() << '\n';      // 1.79769e+308
std::cout << std::numeric_limits<double>::lowest() << '\n';   // -1.79769e+308
```

### Use it in a loop

```cpp
#include <vector>
#include <climits>
#include <algorithm>

std::vector<int> v = {5, 3, 8};
int best = INT_MAX;          // anything is smaller than this
for (int x : v) {
    best = std::min(best, x);
}
std::cout << best << '\n';   // 3
```

### nullptr

```cpp
int* p = nullptr;   // points at nothing
if (p == nullptr) std::cout << "null\n";
if (!p) std::cout << "still null\n";   // same test, shorter
```

### Optional value: std::optional

```cpp harness
#include <bits/stdc++.h>
using namespace std;

{{code}}
```

```cpp
#include <optional>
#include <vector>

std::optional<int> findIndex(const std::vector<int>& v, int target) {
    for (int i = 0; i < (int)v.size(); i++) {
        if (v[i] == target) return i;
    }
    return std::nullopt;   // "no value"
}

int main() {
    std::vector<int> v = {5, 3, 8};
    std::optional<int> r = findIndex(v, 8);
    if (r) std::cout << *r << '\n';                      // 2
    std::cout << findIndex(v, 9).has_value() << '\n';    // 0
    std::cout << findIndex(v, 9).value_or(-1) << '\n';   // -1
}
```

| Call | Does |
|---|---|
| `std::numeric_limits<double>::infinity()` | positive infinity (`<limits>`) |
| `std::isinf(x)`, `std::isnan(x)` | test for infinity, NaN (`<cmath>`) |
| `INT_MAX`, `LLONG_MAX` | largest `int`, `long long` (`<climits>`) |
| `nullptr` | the null pointer |
| `std::nullopt` | an empty `std::optional` |
| `opt.has_value()`, `if (opt)` | is there a value |
| `*opt`, `opt.value()` | get the value |
| `opt.value_or(d)` | the value, or `d` if empty |
| `opt.reset()` | make it empty |

### Gotchas

- `1 / 0` with integers is not infinity. It crashed here with `Floating point exception`.
- `INT_MAX + 1` overflows. Do the sum in `long long` or compare before adding.
- `std::numeric_limits<double>::min()` is the smallest positive double, not the most negative. Use `lowest()`.
- Plain values like `int` and `std::string` can't be null. Use `std::optional` or a sentinel, and prefer `nullptr` to the old `NULL`.
