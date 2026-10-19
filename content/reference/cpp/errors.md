# Errors and Exceptions

C++ has `try` / `catch` / `throw`. The standard exceptions live in `<stdexcept>` and all derive from `std::exception`, whose `what()` returns the message. Many errors are *not* exceptions though: out-of-bounds `v[i]`, dividing by zero, and null pointers are undefined behavior and just crash or give garbage.

### Throw and catch

```cpp
#include <iostream>
#include <stdexcept>

double divide(double a, double b) {
    if (b == 0) throw std::invalid_argument("divide by zero");
    return a / b;
}

try {
    divide(1, 0);
    std::cout << "not reached\n";
} catch (const std::invalid_argument& e) {
    std::cout << "error: " << e.what() << '\n';   // error: divide by zero
}
```

### Several catch blocks

The first matching `catch` wins, so put specific types before general ones.

```cpp
#include <vector>
#include <string>

try {
    std::vector<int> v = {1, 2, 3};
    v.at(10);                          // throws std::out_of_range
} catch (const std::out_of_range& e) {
    std::cout << "bad index\n";
} catch (const std::exception& e) {    // any standard exception
    std::cout << e.what() << '\n';
} catch (...) {                        // anything at all
    std::cout << "unknown error\n";
}
```

### Standard exceptions

| Type | Thrown by or used for |
|---|---|
| `std::out_of_range` | `v.at(i)`, `m.at(k)`, `s.substr(pos)` with a bad position |
| `std::invalid_argument` | `std::stoi("abc")`, bad arguments in your own code |
| `std::runtime_error` | general errors only known at run time |
| `std::logic_error` | bugs, broken preconditions |
| `std::bad_alloc` | `new` ran out of memory (`<new>`) |
| `std::exception` | base of all of the above (`<exception>`) |

### Your own exception type

```cpp
#include <string>

class InsufficientFunds : public std::runtime_error {
public:
    explicit InsufficientFunds(double need)
        : std::runtime_error("need " + std::to_string(need) + " more") {}
};

try {
    throw InsufficientFunds(25);
} catch (const std::runtime_error& e) {   // a base type catches it too
    std::cout << e.what() << '\n';        // need 25.000000 more
}
```

### Rethrow

```cpp
try {
    try {
        throw std::runtime_error("disk full");
    } catch (const std::exception& e) {
        std::cout << "logging: " << e.what() << '\n';
        throw;                              // rethrow the same exception
    }
} catch (const std::exception& e) {
    std::cout << "handled: " << e.what() << '\n';
}
```

### Use it in a loop: skip bad input

```cpp
std::vector<std::string> raw = {"12", "abc", "7", "99999999999"};
int sum = 0;
for (const std::string& s : raw) {
    try {
        sum += std::stoi(s);
    } catch (const std::invalid_argument&) {
        std::cout << "skip " << s << " (not a number)\n";
    } catch (const std::out_of_range&) {
        std::cout << "skip " << s << " (too big)\n";
    }
}
// sum = 19
```

### Errors without exceptions

```cpp
#include <cassert>
#include <optional>

std::optional<int> parse(const std::string& s) {   // empty means "failed"
    try { return std::stoi(s); }
    catch (...) { return std::nullopt; }
}

if (auto n = parse("42")) std::cout << *n;    // 42

int sum = 19;
assert(sum >= 0);    // aborts with a message if false (debug check)
```

`noexcept` on a function promises it never throws. If it does anyway, the program ends.

### Gotchas

- Catch by `const&` (`catch (const std::exception& e)`). Catching by value slices off your derived type.
- `v[i]` out of range does not throw. Use `v.at(i)` when you want an exception.
- Integer divide by zero is a crash (SIGFPE), not an exception you can catch.
- An uncaught exception ends the program with `terminate called after throwing an instance of ...`.
