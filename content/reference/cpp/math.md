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

### gcd, lcm, and integer limits

```cpp
#include <climits>   // INT_MAX, INT_MIN, LLONG_MAX
#include <limits>    // std::numeric_limits
#include <numeric>   // std::gcd, std::lcm

std::cout << std::gcd(12, 18) << ' ' << std::lcm(4, 6) << '\n';   // 6 12
std::cout << INT_MAX << ' ' << INT_MIN << '\n';                    // 2147483647 -2147483648
std::cout << LLONG_MAX << '\n';                                    // 9223372036854775807
std::cout << std::numeric_limits<int>::max() << '\n';              // 2147483647, the same as INT_MAX
std::cout << std::numeric_limits<long long>::min() << '\n';        // -9223372036854775808
```

### A % that is never negative

```cpp
int n = 5;
std::cout << -7 % n << ' ' << ((-7 % n) + n) % n << '\n';   // -2 3
```

### Fast power under a modulus

Square the base and halve the exponent each step: O(log exp) multiplications. Two values under 10^9 + 7 multiply to under 10^18, which fits a `long long`.

```cpp
long long powMod(long long base, long long exp, long long mod) {
    long long result = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) result = result * base % mod;   // this bit of exp is set
        base = base * base % mod;                    // the base for the next bit
        exp >>= 1;
    }
    return result;
}

std::cout << powMod(2, 10, 1000) << '\n';            // 24, 1024 % 1000
std::cout << powMod(2, 62, 1000000007) << '\n';      // 145586002
```

### Sieve of Eratosthenes

```cpp
#include <vector>

int limit = 30;
std::vector<bool> isPrime(limit + 1, true);
isPrime[0] = isPrime[1] = false;
for (long long i = 2; i * i <= limit; i++) {
    if (!isPrime[i]) continue;
    for (long long j = i * i; j <= limit; j += i) isPrime[j] = false;   // cross out the multiples
}
for (int i = 2; i <= limit; i++) {
    if (isPrime[i]) std::cout << i << ' ';   // 2 3 5 7 11 13 17 19 23 29
}
```

### Digits with % and /

```cpp
#include <unordered_set>

int x = -123;
long long rev = 0;                     // room to see an overflow
while (x != 0) {
    rev = rev * 10 + x % 10;           // x % 10 keeps the sign: -3, then -2, then -1
    x /= 10;
}
std::cout << ((rev < INT_MIN || rev > INT_MAX) ? 0 : rev) << '\n';   // -321, 0 if it left the int range

int h = 19;                            // happy number: digit squares until 1, or a repeat
std::unordered_set<int> seen;
while (h != 1 && seen.insert(h).second) {
    int next = 0;
    for (int d = h; d > 0; d /= 10) next += (d % 10) * (d % 10);
    h = next;
}
std::cout << std::boolalpha << (h == 1) << '\n';   // true, 19 -> 82 -> 68 -> 100 -> 1
```

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
