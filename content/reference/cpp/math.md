# Math Operators

The operators are the usual `+ - * / %`. The one thing to know first: when both sides are integers, `/` throws away the remainder. There is no power operator, so use `std::pow` from `<cmath>`.

### Arithmetic

```cpp
#include <iostream>

std::cout << 7 + 2 << ' ' << 7 - 2 << ' ' << 7 * 2 << '\n';   // 9 5 14
std::cout << 7 / 2 << '\n';      // 3, integer division
std::cout << 7.0 / 2 << '\n';    // 3.5, one double makes it a double
std::cout << 7 % 3 << '\n';      // 1
std::cout << -7 / 2 << '\n';     // -3, truncates toward zero
std::cout << -7 % 3 << '\n';     // -1, sign follows the left side
```

### Get a decimal result from ints

```cpp
int a = 7, b = 2;
double avg = static_cast<double>(a) / b;
std::cout << avg << '\n';     // 3.5
double wrong = a / b;
std::cout << wrong << '\n';   // 3, divided as ints first
```

### Split with / and %

```cpp
int seconds = 3725;
std::cout << seconds / 3600 << "h "         // 1h 2m 5s
          << seconds % 3600 / 60 << "m "
          << seconds % 60 << "s\n";
int lastDigit = 1234 % 10;
bool even = 1234 % 2 == 0;
std::cout << lastDigit << ' ' << std::boolalpha << even << '\n';   // 4 true
```

### Compound assignment and increment

```cpp
int x = 10;
x += 5;   // x = x + 5
x -= 3;   // x = x - 3
x *= 2;   // x = x * 2
x /= 4;   // x = x / 4
x %= 4;   // x = x % 4
std::cout << x << '\n';   // 2

int i = 5;
int a = i++;
std::cout << a << ' ' << i << '\n';   // 5 6, a got i, then i went up
int b = ++i;
std::cout << b << ' ' << i << '\n';   // 7 7, i went up, then b got it
```

### Powers and roots

```cpp
#include <cmath>

std::cout << std::pow(2, 10) << '\n';     // 1024, returned as a double
std::cout << std::sqrt(16.0) << '\n';     // 4
std::cout << std::fmod(7.5, 2) << '\n';   // 1.5, % for doubles
```

The rest of `<cmath>` (`abs`, `floor`, `round`, `log`, ...) and `std::max` are in Built-in Functions.

### Precedence

```cpp
std::cout << 2 + 3 * 4 << '\n';     // 14
std::cout << (2 + 3) * 4 << '\n';   // 20
```

`*`, `/`, `%` bind tighter than `+` and `-`, and same-level operators run left to right. Use parentheses when in doubt.

### Use it in a loop

```cpp
int sum = 0;
for (int k = 1; k <= 10; k++) {
    if (k % 2 == 0) sum += k * k;   // squares of the evens
}
std::cout << sum << '\n';   // 220
```

### Gotchas

- `int * int` overflows silently. `100000 * 100000` printed `1410065408`. Write `1LL * m * m` to compute in `long long`.
- `std::pow` returns a `double`, which prints `1.09951e+12` for big values. Cast with `static_cast<long long>` or use `1LL << n` for powers of two.
- A negative `%` is negative. For a wrap-around index write `((i % n) + n) % n`.
- `1 / 2 * x` is always 0 because `1 / 2` is 0. Write `x / 2.0` or `0.5 * x`.
