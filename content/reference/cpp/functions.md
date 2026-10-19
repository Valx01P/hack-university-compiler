# Functions

A function names its return type first: `int add(int a, int b)`. Use `void` when it returns nothing. A function must be declared above the code that calls it, so define helpers above `main` (or declare a prototype there).

### Define and call

```cpp
#include <iostream>
#include <string>

int add(int a, int b) {
    return a + b;
}

void greet(const std::string& name) {     // returns nothing
    std::cout << "hi " << name << '\n';
}

int main() {
    std::cout << add(2, 3) << '\n';       // 5
    greet("ann");                         // hi ann
    for (int i = 1; i <= 3; i++) {
        std::cout << add(i, i) << ' ';    // 2 4 6
    }
}
```

### Prototype (declare now, define later)

```cpp harness
#include <bits/stdc++.h>
using namespace std;

{{code}}
```

```cpp
int square(int x);              // declaration, ends with ;

int main() {
    std::cout << square(4);     // 16
}

int square(int x) {             // definition
    return x * x;
}
```

### Default arguments

```cpp
std::string pad(const std::string& s, int width = 5, char fill = '.') {
    return s + std::string(width - (int)s.size(), fill);
}

pad("ab");             // "ab..."
pad("ab", 4);          // "ab.."
pad("ab", 4, '-');     // "ab--"
```

### Overloading (same name, different parameters)

```cpp
double area(double r) { return 3.14159 * r * r; }
int area(int w, int h) { return w * h; }

area(1.0);             // 3.14159
area(2, 3);            // 6
```

### Pass by value, reference, const reference

```cpp
#include <vector>

void addOne(int x) { x++; }           // works on a copy
void addOneRef(int& x) { x++; }       // changes the caller's variable

int sum(const std::vector<int>& v) {  // no copy, cannot change v
    int total = 0;
    for (int x : v) total += x;
    return total;
}

int n = 5;
addOne(n);             // n is still 5
addOneRef(n);          // n is now 6
```

### Return several values

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int sum(const std::vector<int>& v) {
    int total = 0;
    for (int x : v) total += x;
    return total;
}

{{code}}

int main() {
    std::cout << lo << ' ' << hi << ' ' << mm.first << ' ' << mm.second << '\n';
    std::cout << r << ' ' << g << ' ' << b << '\n';
    std::cout << st.count << ' ' << st.mean << '\n';
}
```

```cpp
#include <algorithm>
#include <tuple>
#include <utility>     // std::pair

std::pair<int, int> minMax(const std::vector<int>& v) {
    return {*std::min_element(v.begin(), v.end()),
            *std::max_element(v.begin(), v.end())};
}

std::vector<int> v = {4, 1, 7};
auto [lo, hi] = minMax(v);              // lo 1, hi 7
std::pair<int, int> mm = minMax(v);     // or mm.first, mm.second

std::tuple<int, int, int> rgb() { return {255, 128, 0}; }   // three or more: std::tuple (<tuple>)
auto [r, g, b] = rgb();

struct Stats {                          // a struct names each value
    int count;
    double mean;
};
Stats describe(const std::vector<int>& v) {
    return {static_cast<int>(v.size()), static_cast<double>(sum(v)) / v.size()};
}
Stats st = describe(v);                 // st.count 3, st.mean 4
```

### Recursion

```cpp
int factorial(int n) {
    if (n <= 1) return 1;       // base case
    return n * factorial(n - 1);
}

factorial(5);                   // 120
```

### auto return, static locals, templates

```cpp
auto twice(int x) { return x * 2; }   // return type deduced: int

int nextId() {
    static int id = 0;          // kept between calls
    return ++id;                // 1, then 2, then 3
}

template <typename T>
T biggest(T a, T b) { return a > b ? a : b; }

biggest(3, 9);                  // 9
biggest(std::string("a"), std::string("b"));  // "b"
```

### Lambdas

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    {{code}}
    std::cout << times3(4) << ' ' << addBonus(1) << ' ' << total << '\n';
    for (const auto& w : words) std::cout << w << ' ';
    std::cout << '\n' << op(3, 4) << '\n';
}
```

```cpp
#include <algorithm>    // std::sort
#include <functional>   // std::function

auto times3 = [](int x) { return x * 3; };
times3(4);                                     // 12

int bonus = 10;
auto addBonus = [bonus](int x) { return x + bonus; };   // copies bonus
int total = 0;
auto addTo = [&total](int x) { total += x; };           // refers to total
addTo(5);                                      // total is 5

std::vector<std::string> words = {"ccc", "a", "bb"};
std::sort(words.begin(), words.end(), [](const std::string& a, const std::string& b) {
    return a.size() < b.size();                // {"a", "bb", "ccc"}
});

std::function<int(int, int)> op = [](int x, int y) { return x * y; };
op(3, 4);                                      // 12
```

| Syntax | Means |
|---|---|
| `void f(int x)` | gets a copy |
| `void f(int& x)` | can change the caller's variable |
| `void f(const T& x)` | no copy, read-only (use for strings, vectors) |
| `int f(int x = 1)` | default argument |
| `[](int x) { ... }` | lambda, captures nothing |
| `[=]` / `[&]` | lambda captures everything by copy / by reference |
| `std::function<R(A, B)>` | holds any function or lambda |

### Gotchas

- Calling a function above its definition fails with "was not declared in this scope". Move it up or add a prototype.
- A non-`void` function that falls off the end without `return` is undefined behavior, not a compile error.
- Passing a `std::vector` or `std::string` by value copies it every call. Use `const&`.
- Never return a reference or pointer to a local variable. It is destroyed when the function returns.
