# If and Else

`else if` is two words, and each condition sits in its own parentheses. The first branch whose condition is true runs, and the rest are skipped.

### if / else

```cpp
#include <iostream>

int n = -4;
if (n >= 0) {
    std::cout << "non-negative\n";
} else {
    std::cout << "negative\n";   // runs
}
```

### else if chain

```cpp
int score = 84;
char grade;
if (score >= 90) {
    grade = 'A';
} else if (score >= 80) {
    grade = 'B';    // runs, the rest are skipped
} else if (score >= 70) {
    grade = 'C';
} else {
    grade = 'F';
}
std::cout << grade << '\n';   // B
```

### Nested

```cpp
int age = 25;
bool hasTicket = true;
if (age >= 18) {
    if (hasTicket) {
        std::cout << "enter\n";   // runs
    } else {
        std::cout << "buy a ticket\n";
    }
} else {
    std::cout << "too young\n";
}
```

### if with an initializer (C++17)

```cpp
#include <map>
#include <string>

std::map<std::string, int> stock = {{"apple", 3}};
if (auto it = stock.find("apple"); it != stock.end()) {
    std::cout << it->second << '\n';   // 3
} else {
    std::cout << "none\n";
}
// it is out of scope here
```

The variable before the `;` lives only inside the `if` and its `else` branches.

### Early return instead of nesting

```cpp harness
#include <bits/stdc++.h>
using namespace std;

{{code}}
```

```cpp
#include <string>

std::string classify(int n) {
    if (n < 0) return "negative";
    if (n == 0) return "zero";
    if (n % 2 == 0) return "even";
    return "odd";
}

int main() {
    std::cout << classify(-3) << ' ' << classify(0) << ' ' << classify(7) << '\n';
    // negative zero odd
}
```

### Use it in a loop

```cpp
for (int i = 1; i <= 15; i++) {
    if (i % 15 == 0) {
        std::cout << "FizzBuzz ";
    } else if (i % 3 == 0) {
        std::cout << "Fizz ";
    } else if (i % 5 == 0) {
        std::cout << "Buzz ";
    } else {
        std::cout << i << ' ';
    }
}
std::cout << '\n';
// 1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```

### Gotchas

- Order matters. Put the most specific test first, or `i % 3` catches 15 before `i % 15` does.
- `if (x > 0);` with a stray semicolon ends the `if` right there, so the block below always runs.
- Without braces only one statement belongs to the `if`. An `else` pairs with the nearest `if`, so use braces when nesting.
- A variable declared inside the braces is gone after them. Declare it before the `if` if you need it later.
