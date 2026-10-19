# Strings

Use `std::string` from `<string>`. Unlike Java or Python strings it is mutable, and `=` makes a full copy. A single character is a `char` in single quotes (`'a'`), a string is double quotes (`"a"`).

### Create

```cpp
#include <iostream>
#include <string>

std::string s = "hello";
std::string dashes(5, '-');
std::cout << dashes << '\n';           // -----
std::string one(1, 'A');
std::cout << one << '\n';              // A, a char as a string
std::string empty;
std::cout << empty.size() << '\n';     // 0, the string is ""
std::string raw = R"(C:\path\n)";      // raw string, backslashes kept
```

### Length and characters

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::string s = "hello";
    {{code}}
}
```

```cpp
std::cout << std::boolalpha;
std::cout << s.size() << '\n';         // 5, same as s.length()
std::cout << s.empty() << '\n';        // false
std::cout << s[0] << '\n';             // h, a char
std::cout << s.front() << '\n';        // h
std::cout << s.back() << '\n';         // o
s[0] = 'H';
std::cout << s << '\n';                // Hello
```

### Join and build

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::string s = "Hello";
    {{code}}
}
```

```cpp
std::string full = s + ", " + "world";
std::cout << full << '\n';             // Hello, world
s += "!";                              // add to the end
s.push_back('?');                      // add one char
std::cout << s << '\n';                // Hello!?
s.pop_back();                          // drop the last char
std::cout << s << '\n';                // Hello!

std::string rep;
for (int i = 0; i < 3; i++) rep += "ab";
std::cout << rep << '\n';              // ababab, there is no s * 3
```

### Search and slice

```cpp
#include <algorithm>

std::cout << std::boolalpha;
std::string str = "banana split";
std::cout << str.substr(0, 6) << '\n';      // banana (start, length)
std::cout << str.substr(7) << '\n';         // split, to the end
std::cout << str.find("an") << '\n';        // 1
std::cout << str.find("an", 2) << '\n';     // 3, search from index 2
std::cout << str.rfind("an") << '\n';       // 3, last match
std::cout << (str.find('z') == std::string::npos) << '\n';      // true, not found
std::cout << std::count(str.begin(), str.end(), 'a') << '\n';   // 3, how many 'a'

if (str.find("split") != std::string::npos) {
    std::cout << "contains\n";
}
```

### Edit in place

```cpp
std::string x = "banana split";
x.replace(0, 6, "apple");
std::cout << x << '\n';                // apple split (start, length, new)
x.insert(0, "big ");
std::cout << x << '\n';                // big apple split
x.erase(3, 6);
std::cout << x << '\n';                // big split (start, length)
```

### Starts and ends with

`starts_with` and `ends_with` are C++20, not available here.

```cpp
std::string fn = "photo.png";
std::string suf = ".png";
bool starts = fn.rfind("photo", 0) == 0;
bool ends = fn.size() >= suf.size() &&
            fn.compare(fn.size() - suf.size(), suf.size(), suf) == 0;
std::cout << std::boolalpha << starts << ' ' << ends << '\n';   // true true
```

### Compare

```cpp
std::cout << std::boolalpha;
std::cout << (std::string("abc") == "abc") << '\n';       // true, compares contents
std::cout << (std::string("apple") < "banana") << '\n';   // true, dictionary order
std::cout << (std::string("Zebra") < "apple") << '\n';    // true, uppercase sorts first
```

### Convert

```cpp
std::cout << std::stoi("42") << '\n';            // 42, int
std::cout << std::stoll("9000000000") << '\n';   // 9000000000, long long
std::cout << std::stod("3.5") << '\n';           // 3.5, double
std::cout << std::stoi("12abc") << '\n';         // 12, stops at the first non-digit
std::cout << std::to_string(7) << '\n';          // 7
std::cout << std::to_string(2.5) << '\n';        // 2.500000
char d = '7';
int digit = d - '0';
std::cout << digit << '\n';                      // 7
char c = 'a' + 2;
std::cout << c << '\n';                          // c
```

### Case, trim, reverse, sort

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    {{code}}
}
```

```cpp
#include <algorithm>
#include <cctype>

std::string u = "Hello";
std::transform(u.begin(), u.end(), u.begin(),
               [](unsigned char ch) { return std::toupper(ch); });
std::cout << u << '\n';                // HELLO

std::string pad = "  hi  ";
std::size_t first = pad.find_first_not_of(' ');
std::size_t last = pad.find_last_not_of(' ');
std::string trimmed = pad.substr(first, last - first + 1);
std::cout << trimmed << '\n';          // hi, there is no trim()

std::string r = "abc";
std::reverse(r.begin(), r.end());
std::cout << r << '\n';                // cba
std::sort(r.begin(), r.end());
std::cout << r << '\n';                // abc
```

### Split and join

```cpp
#include <sstream>
#include <vector>

std::istringstream in("a b  c");
std::string word;
std::vector<std::string> words;
while (in >> word) words.push_back(word);
for (const auto& w : words) std::cout << '[' << w << ']';   // [a][b][c]
std::cout << '\n';

std::istringstream csv("x,y,,z");
std::string part;
std::vector<std::string> parts;
while (std::getline(csv, part, ',')) parts.push_back(part);
for (const auto& p : parts) std::cout << '[' << p << ']';   // [x][y][][z]
std::cout << '\n';

std::string joined;
for (std::size_t i = 0; i < parts.size(); i++) {
    if (i > 0) joined += "-";
    joined += parts[i];
}
std::cout << joined << '\n';                                // x-y--z
```

To build a string from mixed values with `<<`, use `std::ostringstream` (see Printing Variables).

| Call | Does |
|---|---|
| `s.size()` | length |
| `s.substr(i, n)` | `n` chars from index `i` |
| `s.find(t)` | index of `t`, or `std::string::npos` |
| `s.replace(i, n, t)` | swap `n` chars at `i` for `t` |
| `s.insert(i, t)` / `s.erase(i, n)` | add / remove at index `i` |
| `s.c_str()` | a `const char*` for C functions |
| `std::stoi(s)` / `std::stod(s)` | string to number |
| `std::to_string(x)` | number to string |
| `std::getline(stream, s, ',')` | read up to a delimiter |

### Gotchas

- `"a" + "b"` does not compile: both are C string literals. Make one a `std::string` first: `std::string("a") + "b"`.
- `find` returns `std::string::npos` (a huge unsigned number), not -1. Compare against `npos`.
- `std::stoi("abc")` throws `std::invalid_argument`. Catch it when the input might not be a number.
- `s[i]` is a `char`, so compare with `'a'`, not `"a"`.
