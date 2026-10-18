# Printing

C++ prints by streaming values into `std::cout` with `<<`. Nothing adds a space or a newline for you, so you write `' '` and `'\n'` yourself.

### Print a line

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    std::cout << "Hello" << std::endl;  // newline + flush
}
```

### Chain values

```cpp
std::cout << "age" << ' ' << 42 << ' ' << 3.5 << '\n';  // age 42 3.5
std::cout << "no newline";
std::cout << " same line\n";                         // no newline same line
```

### Escapes and raw strings

```cpp
std::cout << "Line 1\nLine 2\n";
std::cout << "Tab\there\n";                       // Tab	here
std::cout << "Quote: \"hi\"\n";                   // Quote: "hi"
std::cout << R"(C:\path\no "escapes")" << '\n';   // C:\path\no "escapes"
```

| Escape | Prints |
|---|---|
| `\n` | newline |
| `\t` | tab |
| `\\` | one backslash |
| `\"` | double quote |
| `\'` | single quote (in a `char`) |

### What different types print as

```cpp
std::cout << true << ' ' << false << '\n';          // 1 0
std::cout << std::boolalpha << true << '\n';        // true
std::cout << 'A' << ' ' << 'A' + 1 << '\n';         // A 66
std::cout << static_cast<char>('A' + 1) << '\n';    // B
std::cout << 1.0 << ' ' << 0.1 + 0.2 << '\n';       // 1 0.3
std::cout << 1234567.0 << '\n';                     // 1.23457e+06
```

Doubles print with 6 significant digits by default. Printing Variables covers `std::setprecision` and widths.

### Use it in a loop

```cpp
for (int i = 1; i <= 3; i++) {
    std::cout << i << ' ';
}
std::cout << '\n';  // 1 2 3

for (int i = 0; i < 4; i++) {
    if (i > 0) std::cout << ", ";
    std::cout << i;
}
std::cout << '\n';  // 0, 1, 2, 3
```

### Other outputs

```cpp
#include <cstdio>
#include <string>

std::cerr << "error message\n";                  // goes to stderr
std::printf("%d items, %.2f each\n", 3, 1.5);    // 3 items, 1.50 each
std::cout << std::string(10, '-') << '\n';       // ----------
```

| Call | Does |
|---|---|
| `std::cout << x` | print to stdout (`<iostream>`) |
| `std::cerr << x` | print to stderr, unbuffered |
| `'\n'` | newline, fast |
| `std::endl` | newline and flush, slow in big loops |
| `std::printf(fmt, ...)` | C-style formatted print (`<cstdio>`) |

### Gotchas

- `std::cout << a, b` prints only `a`. Chain with `<<` every time.
- `'A' + 1` is an `int` (66), not `'B'`. Cast back with `static_cast<char>`.
- `std::endl` flushes on every call, so use `'\n'` inside loops.
