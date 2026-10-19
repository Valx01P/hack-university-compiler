# Built-in Functions

C++ has no global built-ins like Python's `max` or `len`. They live in headers under `std::`: `std::max` in `<algorithm>`, math in `<cmath>`, sums in `<numeric>`. Include the header, then call with the `std::` prefix.

### Min, max, clamp

```cpp
#include <algorithm>

std::cout << std::max(3, 7) << '\n';            // 7
std::cout << std::min(3, 7) << '\n';            // 3
std::cout << std::max({4, 9, 2}) << '\n';       // 9, any number of values in braces
std::cout << std::min({4, 9, 2}) << '\n';       // 2
auto [lo, hi] = std::minmax({4, 9, 2});
std::cout << lo << ' ' << hi << '\n';           // 2 9
std::cout << std::clamp(15, 0, 10) << '\n';     // 10, keeps a value in [0, 10] (C++17)
std::cout << std::max<double>(2, 3.5) << '\n';  // 3.5, mixed types need the <double>
```

### Math from cmath

```cpp
#include <cmath>

std::cout << std::pow(2, 10) << '\n';         // 1024 (a double)
std::cout << std::sqrt(16.0) << '\n';         // 4
std::cout << std::cbrt(27.0) << '\n';         // 3
std::cout << std::abs(-5) << '\n';            // 5, works for int and double
std::cout << std::abs(-2.5) << '\n';          // 2.5
std::cout << std::floor(2.7) << '\n';         // 2
std::cout << std::ceil(2.1) << '\n';          // 3
std::cout << std::round(2.5) << '\n';         // 3, halves round away from zero
std::cout << std::trunc(-2.7) << '\n';        // -2, drops the decimals
std::cout << std::fmod(7.5, 2) << '\n';       // 1.5, % for doubles
std::cout << std::log(1.0) << '\n';           // 0, natural log
std::cout << std::log2(8.0) << '\n';          // 3
std::cout << std::log10(1000.0) << '\n';      // 3
std::cout << std::exp(1.0) << '\n';           // 2.71828
std::cout << std::hypot(3.0, 4.0) << '\n';    // 5, sqrt(3*3 + 4*4)
std::cout << std::sin(0.0) << '\n';           // 0, radians (also cos, tan, atan2)
std::cout << M_PI << '\n';                    // 3.14159 (M_E is e), g++ defines both
```

### gcd and lcm

```cpp
#include <numeric>

std::cout << std::gcd(12, 18) << '\n';  // 6 (C++17)
std::cout << std::lcm(4, 6) << '\n';    // 12 (C++17)
```

### Length, sum, min, max of a vector

```cpp
#include <algorithm>
#include <numeric>
#include <vector>

std::vector<int> v = {5, 3, 8, 1};
std::cout << v.size() << '\n';                                // 4, like len(v)
std::cout << std::accumulate(v.begin(), v.end(), 0) << '\n';  // 17, the sum
std::accumulate(v.begin(), v.end(), 0LL);                     // sum as long long
std::cout << *std::max_element(v.begin(), v.end()) << '\n';   // 8
std::cout << *std::min_element(v.begin(), v.end()) << '\n';   // 1
std::cout << std::max_element(v.begin(), v.end()) - v.begin() << '\n';  // 2, index of the max
```

Sorting, searching, and the other algorithms are in Standard Library. Integer limits like `INT_MAX` are in Variables and Types.

| Call | Header | Does |
|---|---|---|
| `std::max(a, b)` / `std::min(a, b)` | `<algorithm>` | larger / smaller |
| `std::clamp(x, lo, hi)` | `<algorithm>` | `x` limited to `[lo, hi]` |
| `std::abs(x)` | `<cmath>` | absolute value |
| `std::pow(b, e)` | `<cmath>` | power, as a double |
| `std::sqrt(x)` | `<cmath>` | square root |
| `std::floor` / `std::ceil` / `std::round` | `<cmath>` | rounding, as doubles |
| `std::gcd(a, b)` / `std::lcm(a, b)` | `<numeric>` | greatest common divisor / least common multiple |
| `std::accumulate(b, e, init)` | `<numeric>` | sum of a range |
| `std::max_element(b, e)` | `<algorithm>` | iterator to the largest |
| `sizeof(int)` | none | size in bytes: 4 |

### Gotchas

- `std::max(2, 3.5)` does not compile: both arguments must have the same type. Write `std::max(2.0, 3.5)` or `std::max<double>(2, 3.5)`.
- `std::pow` returns a double. For integer powers, multiply in a loop or cast with `static_cast<long long>(std::pow(10, 9))`.
- `std::accumulate(v.begin(), v.end(), 0)` sums in `int`, so doubles get truncated and big sums overflow. Start from `0.0` or `0LL`.
- `*std::max_element` on an empty vector is undefined behavior. Check `v.empty()` first.
