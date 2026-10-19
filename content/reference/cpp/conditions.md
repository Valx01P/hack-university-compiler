# Conditions and Logic

A condition goes in parentheses after `if`, and the body goes in braces. Comparisons give a `bool`, and any number works as a condition too: `0` is false, everything else is true.

### if

```cpp
#include <iostream>

int temp = 30;
if (temp > 25) {
    std::cout << "hot\n";
}
if (temp > 25) std::cout << "still hot\n";   // one statement, braces optional
```

### Comparison operators

```cpp
int a = 5, b = 7;
std::cout << (a == b) << (a != b) << '\n';   // 01
std::cout << (a < b) << (a <= b) << '\n';    // 11
std::cout << (a > b) << (a >= b) << '\n';    // 00
std::cout << std::boolalpha << (a < b) << '\n';   // true
```

### Logical operators

```cpp
int age = 20;
bool member = false;
if (age >= 18 && age < 65) std::cout << "adult\n";   // and
if (age < 13 || member) std::cout << "discount\n";   // or, skipped
if (!member) std::cout << "not a member\n";          // not
if (age >= 18 and not member) std::cout << "ok\n";   // and, or, not also work
```

| Operator | Means |
|---|---|
| `==`, `!=` | equal, not equal |
| `<`, `<=`, `>`, `>=` | ordering |
| `&&` | and, stops at the first false |
| `\|\|` | or, stops at the first true |
| `!` | not |

### Short-circuit

```cpp
#include <vector>

std::vector<int> v;
if (!v.empty() && v[0] > 0) {   // v[0] never runs when v is empty
    std::cout << "first is positive\n";
}

int d = 0;
if (d != 0 && 10 / d > 1) std::cout << "big\n";   // safe, no divide by zero
std::cout << "no crash\n";                        // both ifs were skipped safely
```

### Truthiness

```cpp
#include <string>

int count = 3;
if (count) std::cout << "nonzero\n";        // any non-zero number is true

std::string s = "";
if (s.empty()) std::cout << "empty\n";      // a string is not a bool, ask it

int* p = nullptr;
if (!p) std::cout << "no pointer\n";        // a null pointer is false
```

### Comparing strings and doubles

```cpp
#include <string>
#include <cmath>

std::string a = "apple", b = "banana";
std::cout << (a == "apple") << (a < b) << '\n';   // 11, compares text
std::cout << a.compare(b) << '\n';                // negative, a sorts first

double x = 0.1 + 0.2;
std::cout << (x == 0.3) << '\n';                    // 0
std::cout << (std::fabs(x - 0.3) < 1e-9) << '\n';   // 1
```

### Use it in a loop

```cpp
int evens = 0, inRange = 0;
for (int i = 1; i <= 20; i++) {
    if (i % 2 == 0) evens++;
    if (i >= 5 && i <= 10) inRange++;
}
std::cout << evens << ' ' << inRange << '\n';   // 10 6
```

### Gotchas

- `if (x = 5)` assigns and is always true. Write `==`.
- `1 < x < 10` compiles but means `(1 < x) < 10`, which is always true. Write `x > 1 && x < 10`.
- `0.1 + 0.2 == 0.3` is false. Compare doubles with a tolerance, as above.
- Two `const char*` strings compare by address. Compare `std::string` values, or use `std::strcmp` from `<cstring>`.
