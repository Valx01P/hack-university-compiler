# While Loops

`while` checks its condition before each pass, `do { } while (...);` checks after, so its body always runs at least once. Use them when you do not know the number of passes up front.

### while

```cpp
#include <iostream>

int i = 0;
while (i < 3) {
    std::cout << i << ' ';        // 0 1 2
    i++;                          // forget this and it never ends
}
```

### Loop until a condition

```cpp
int n = 1234;
int digitSum = 0;
while (n > 0) {
    digitSum += n % 10;           // last digit
    n /= 10;                      // drop last digit
}
std::cout << digitSum << '\n';    // 10

int value = 100, halvings = 0;
while (value > 1) {
    value /= 2;
    std::cout << value << ' ';    // 50 25 12 6 3 1
    halvings++;
}
std::cout << '\n';
std::cout << halvings << '\n';    // 6
```

### do-while

```cpp
int num = 0, digits = 0;
do {
    digits++;
    num /= 10;
} while (num != 0);               // note the semicolon
std::cout << digits << '\n';      // 1, a plain while would give 0 for num = 0
```

### Infinite loop with break

```cpp
int count = 0;
while (true) {
    count++;
    if (count == 5) break;        // continue also works here
}
std::cout << count << '\n';       // 5
```

### Scan with a guard

```cpp
#include <vector>

std::vector<int> v = {1, 3, 5, 8, 9};
std::size_t k = 0;
while (k < v.size() && v[k] % 2 != 0) {   // bounds check first
    k++;
}
std::cout << k << '\n';           // 3, index of the first even
```

### Read input until it runs out

```stdin
3 4 5
```

```cpp
#include <string>

int x;
int total = 0;
while (std::cin >> x) {           // false at end of input or bad input
    total += x;
}
std::cout << total << '\n';       // 12 for input "3 4 5"

// Or read whole lines instead:
std::string line;
while (std::getline(std::cin, line)) {
    std::cout << '[' << line << "]\n";    // one whole line at a time
}
```

| Form | Does |
|---|---|
| `while (cond) { }` | check, then run, repeat |
| `do { } while (cond);` | run, then check, repeat |
| `while (true) { }` | run until `break` or `return` |
| `while (std::cin >> x)` | read values until input ends |
| `while (std::getline(std::cin, s))` | read lines until input ends |

### Gotchas

- `while (x = 5)` assigns and is always true. You meant `==`.
- `while (!std::cin.eof())` runs one extra time with a stale value. Loop on `while (std::cin >> x)` instead.
- The `do { } while (cond);` form needs the trailing semicolon.
- Put the bounds check first in `k < v.size() && v[k] ...`, so `&&` stops before reading past the end.
