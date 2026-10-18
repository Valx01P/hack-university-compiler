# Variables and Types

C++ is statically typed: every variable has a fixed type, declared before the name or deduced with `auto`. A local variable you don't initialize holds garbage, so always give it a value.

### Declare

```cpp
#include <string>

int age = 30;
double price = 9.99;
char grade = 'A';          // single quotes for one char
bool done = false;
std::string name = "Ada";  // double quotes, needs <string>
long long big = 9000000000LL;
```

### Initialize with braces

```cpp
int count{5};
int zero{};        // 0
int trunc = 3.7;   // 3, silently drops the decimals
// int bad{3.7};   // compile error: braces refuse narrowing
```

### auto and constants

```cpp
auto n = 42;                  // int
auto d = 3.14;                // double
auto s = "hi";                // const char*, not std::string
auto t = std::string("hi");   // std::string

const int MAX = 100;          // can't change after this line
constexpr double PI = 3.14159;  // known at compile time
```

### Common types

| Type | Size here | Holds |
|---|---|---|
| `bool` | 1 | `true` or `false` |
| `char` | 1 | one character, `'A'` |
| `int` | 4 | about plus or minus 2.1 billion |
| `long long` | 8 | about plus or minus 9.2e18 |
| `double` | 8 | decimal, about 15 digits |
| `float` | 4 | decimal, about 7 digits |
| `std::string` | n/a | text (`<string>`) |
| `std::int64_t`, `std::uint8_t` | 8, 1 | exact widths (`<cstdint>`) |

### Limits

```cpp
#include <iostream>
#include <climits>
#include <limits>

std::cout << INT_MAX << '\n';                           // 2147483647
std::cout << INT_MIN << '\n';                           // -2147483648
std::cout << LLONG_MAX << '\n';                         // 9223372036854775807
std::cout << std::numeric_limits<int>::max() << '\n';   // 2147483647
std::cout << sizeof(int) << ' ' << sizeof(long long) << '\n';  // 4 8
```

### Convert between types

```cpp
double x = 7.9;
int i = static_cast<int>(x);                 // 7, truncates toward zero
double half = static_cast<double>(7) / 2;    // 3.5

char c = '7';
int digit = c - '0';                         // 7
int code = static_cast<int>('A');            // 65
char next = static_cast<char>(code + 1);     // 'B'
```

String to number and back (`std::stoi`, `std::to_string`) is in Strings.

### Literals

```cpp
int million = 1'000'000;   // quotes are digit separators
int hex = 0xFF;            // 255
int bin = 0b1010;          // 10
long long huge = 9'000'000'000LL;  // LL makes a long long literal
float f = 1.5f;            // without f it's a double
unsigned u = 42u;
```

### Use it in a loop

```cpp
long long total = 0;           // an int would overflow here
for (int k = 1; k <= 100000; k++) {
    total += k;
}
std::cout << total << '\n';    // 5000050000
```

### Gotchas

- Signed overflow is undefined. `INT_MAX + 1` printed `-2147483648` here, but don't rely on it. Use `long long` for big sums.
- `auto s = "hi"` is a C string, so `s + "!"` doesn't compile. Write `std::string s = "hi"`.
- Unsigned wraps around: `unsigned int u = 0` then `u - 1` is `4294967295`.
- `std::uint8_t` and `std::int8_t` are chars, so `std::cout` prints them as characters. Print `+x` to see the number.
