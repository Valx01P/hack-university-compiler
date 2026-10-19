# Switch

`switch` jumps to the `case` that matches an integer, `char`, or enum value. Each case needs a `break`, or it falls through into the next case. It doesn't work on strings or doubles.

### Basic switch

```cpp
#include <iostream>

int day = 3;
switch (day) {
    case 1:
        std::cout << "Mon\n";
        break;
    case 2:
        std::cout << "Tue\n";
        break;
    case 3:
        std::cout << "Wed\n";   // runs
        break;
    default:
        std::cout << "other\n";
}
```

### Several cases, one body

```cpp
char c = 'e';
switch (c) {
    case 'a':
    case 'e':
    case 'i':
    case 'o':
    case 'u':
        std::cout << "vowel\n";   // runs
        break;
    default:
        std::cout << "consonant\n";
}
```

### Fallthrough on purpose

```cpp
int level = 2;
switch (level) {
    case 3:
        std::cout << "gold ";
        [[fallthrough]];   // C++17, says "I meant this"
    case 2:
        std::cout << "silver ";
        [[fallthrough]];
    case 1:
        std::cout << "bronze\n";
        break;
}
// silver bronze
```

### Declare a variable inside a case

```cpp
int op = 1;
switch (op) {
    case 1: {
        int doubled = op * 2;   // braces give it its own scope
        std::cout << doubled << '\n';   // 2
        break;
    }
    default:
        break;
}
```

### Switch on an enum

```cpp harness
#include <bits/stdc++.h>
using namespace std;

{{code}}
```

```cpp
enum class Color { Red, Green, Blue };

int main() {
    Color c = Color::Green;
    switch (c) {
        case Color::Red:   std::cout << "stop\n"; break;
        case Color::Green: std::cout << "go\n"; break;   // runs
        case Color::Blue:  std::cout << "blue?\n"; break;
    }
}
```

### Strings: use if/else or a map

```cpp
#include <string>
#include <map>

std::string cmd = "stop";
// switch (cmd) does not compile
if (cmd == "start") {
    std::cout << "starting\n";
} else if (cmd == "stop") {
    std::cout << "stopping\n";   // runs
}

std::map<std::string, int> codes = {{"start", 1}, {"stop", 2}};
switch (codes[cmd]) {   // a missing key gives 0, so default runs
    case 1: std::cout << "start\n"; break;
    case 2: std::cout << "stop\n"; break;   // runs
    default: std::cout << "unknown\n";
}
```

### Use it in a loop

```cpp
#include <string>
#include <cctype>

std::string text = "a1 b2!";
int letters = 0, digits = 0, other = 0;
for (char ch : text) {
    switch (ch) {
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
            digits++;
            break;
        case ' ':
            break;   // ignore spaces
        default:
            if (std::isalpha(static_cast<unsigned char>(ch))) letters++;
            else other++;
    }
}
std::cout << letters << ' ' << digits << ' ' << other << '\n';   // 2 2 1
```

| Piece | Does |
|---|---|
| `case 5:` | a constant to match, no ranges or variables |
| `break;` | leave the switch |
| `default:` | runs when nothing matched, optional |
| `[[fallthrough]];` | mark an intended fallthrough (C++17) |
| `switch (auto x = f(); x)` | switch with an initializer (C++17) |

### Gotchas

- A missing `break` runs the next case too. This is the most common switch bug.
- `case` labels must be compile-time constants. No `case x > 5:`, use `if` for ranges.
- `break` inside a switch leaves the switch, not the loop around it. Use `continue` or a flag to leave the loop.
- Declaring a variable with an initializer directly under a `case` is a compile error ("jump to case label"). Wrap the case body in braces.
