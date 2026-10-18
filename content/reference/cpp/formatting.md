# Printing Variables

There is no f-string here. You chain text and variables with `<<`, and control decimals and widths with manipulators from `<iomanip>`. `std::format` is C++20, so it is not available here.

### Mix text and variables

```cpp
#include <iostream>
#include <string>

std::string name = "Ada";
int age = 36;
std::cout << name << " is " << age << " years old\n";   // Ada is 36 years old
std::cout << "Sum: " << age + 4 << '\n';                // Sum: 40
```

### Decimals

```cpp
#include <iomanip>

double pi = 3.14159265;
std::cout << pi << '\n';                                       // 3.14159
std::cout << std::fixed << std::setprecision(2) << pi << '\n'; // 3.14
std::cout << 2.0 << '\n';                                      // 2.00, still fixed
std::cout << std::defaultfloat << pi << '\n';                  // 3.1, now 2 significant digits
std::cout << std::setprecision(6);                             // back to the default
```

### Width and alignment

```cpp
#include <iomanip>

std::cout << '[' << std::setw(6) << 42 << "]\n";                      // [    42]
std::cout << '[' << std::left << std::setw(6) << 42 << "]\n";         // [42    ]
std::cout << std::right;                                              // undo left
std::cout << std::setfill('0') << std::setw(5) << 7 << '\n';          // 00007
std::cout << std::setfill(' ');                                       // undo fill
```

### Bases and booleans

```cpp
#include <iomanip>

std::cout << std::hex << 255 << ' ' << std::dec << 255 << '\n';   // ff 255
std::cout << std::boolalpha << (3 > 2) << '\n';                   // true
```

### Build a string

```cpp
#include <sstream>
#include <string>
#include <iomanip>

std::string s = "x=" + std::to_string(5) + ", y=" + std::to_string(7);
std::cout << s << '\n';   // x=5, y=7

std::ostringstream out;
out << "total: " << std::fixed << std::setprecision(1) << 9.75;
std::string line = out.str();
std::cout << line << '\n';   // total: 9.8
```

### printf style

```cpp
#include <cstdio>
#include <string>

std::string name = "Ada";
std::printf("%s has %d points, avg %.2f\n", name.c_str(), 12, 3.456);  // Ada has 12 points, avg 3.46
std::printf("[%5d] [%-5d] [%05d]\n", 42, 42, 42);                       // [   42] [42   ] [00042]
```

| Call | Does |
|---|---|
| `std::fixed` | fixed-point, sticky |
| `std::setprecision(n)` | digits after the point with `fixed`, significant digits without, sticky |
| `std::setw(n)` | width of the next item only |
| `std::left`, `std::right` | alignment inside the width, sticky |
| `std::setfill(c)` | padding character, sticky |
| `std::hex`, `std::dec` | integer base, sticky |
| `std::boolalpha` | print `true` and `false`, sticky |
| `std::to_string(x)` | number to `std::string` |
| `std::ostringstream` | build a string with `<<` (`<sstream>`) |

### Use it in a loop

```cpp
#include <iomanip>
#include <string>

std::string items[] = {"apple", "kiwi", "banana"};
double prices[] = {1.5, 0.25, 12};
std::cout << std::fixed << std::setprecision(2);
for (int i = 0; i < 3; i++) {
    std::cout << std::left << std::setw(8) << items[i]
              << std::right << std::setw(7) << prices[i] << '\n';
}
// apple      1.50
// kiwi       0.25
// banana    12.00
```

### Gotchas

- Everything except `setw` is sticky and changes all later output until you reset it.
- `"Age: " + age` compiles but does pointer math. Use `<<` or `std::to_string(age)`.
- `printf("%s", s)` with a `std::string` is undefined. Pass `s.c_str()`.
- `std::to_string(2.5)` gives `"2.500000"`. Use `std::ostringstream` with `setprecision` for clean decimals.
