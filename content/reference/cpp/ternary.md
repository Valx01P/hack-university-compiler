# Ternary

`cond ? a : b` is an expression: it gives `a` when `cond` is true and `b` otherwise. Use it to pick a value, not to run statements.

### Pick a value

```cpp
int x = -7;
int absX = (x >= 0) ? x : -x;               // 7
int bigger = (3 > 5) ? 3 : 5;               // 5
const char* sign = (x < 0) ? "neg" : "pos"; // "neg"
```

### Inside an expression

```cpp
#include <iostream>
#include <string>

int n = 1;
std::cout << n << (n == 1 ? " item" : " items") << '\n';   // 1 item

int count = 3;
std::string label = "file" + std::string(count == 1 ? "" : "s");   // "files"
```

Wrap the whole ternary in parentheses when you print it, because `<<` binds tighter than `?:`.

### Chained

```cpp
int score = 75;
char grade = score >= 90 ? 'A'
           : score >= 80 ? 'B'
           : score >= 70 ? 'C'
           : 'F';
std::cout << grade << '\n';   // C
```

Past two levels an `if` / `else if` chain is easier to read.

### Initialize a const

```cpp
bool debug = true;
const int limit = debug ? 10 : 1000;   // a const can't be set later in an if
```

### Use it in a loop

```cpp
for (int i = 1; i <= 5; i++) {
    std::cout << (i % 2 == 0 ? "even" : "odd") << (i < 5 ? ", " : "\n");
}
// odd, even, odd, even, odd

int maxVal = 0;
int nums[] = {4, 9, 2};
for (int v : nums) {
    maxVal = v > maxVal ? v : maxVal;
}
std::cout << maxVal << '\n';   // 9
```

### Gotchas

- `std::cout << done ? "yes" : "no";` prints `1` or `0`, because it parses as `(std::cout << done) ? ...`. Always parenthesize the ternary.
- Both branches must have compatible types. `flag ? 1 : "one"` doesn't compile.
- Two string literals give a C string, not a `std::string`, so `(flag ? "a" : "b") + "!"` doesn't compile. Make one side a `std::string`.
- Don't use it for side effects like `ok ? save() : quit();`. Write an `if`.
