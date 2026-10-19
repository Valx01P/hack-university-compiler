# Strings

Use `std::string` from `<string>`. Unlike Java or Python strings it is mutable, and `=` makes a full copy. A single character is a `char` in single quotes (`'a'`), a string is double quotes (`"a"`).

### Create

```cpp
#include <iostream>
#include <string>

std::string s = "hello";
std::string dashes(5, '-');            // "-----"
std::string one(1, 'A');               // "A", a char as a string
std::string empty;                     // ""
std::string raw = R"(C:\path\n)";      // raw string, backslashes kept
```

### Length and characters

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::string s = "hello";
    {{code}}
    std::cout << s << '\n';
}
```

```cpp
s.size();                              // 5, same as s.length()
s.empty();                             // false
s[0];                                  // 'h', a char
s.front();                             // 'h'
s.back();                              // 'o'
s[0] = 'H';                            // "Hello"
```

### Join and build

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::string s = "Hello";
    {{code}}
    std::cout << full << '\n' << s << '\n' << rep << '\n';
}
```

```cpp
std::string full = s + ", " + "world"; // "Hello, world"
s += "!";                              // "Hello!"
s.push_back('?');                      // "Hello!?"
s.pop_back();                          // "Hello!"

std::string rep;
for (int i = 0; i < 3; i++) rep += "ab";   // "ababab", there is no s * 3
```

### Search and slice

```cpp
#include <algorithm>

std::string str = "banana split";
str.substr(0, 6);                      // "banana" (start, length)
str.substr(7);                         // "split", to the end
str.find("an");                        // 1
str.find("an", 2);                     // 3, search from index 2
str.rfind("an");                       // 3, last match
str.find('z') == std::string::npos;    // true, not found
std::count(str.begin(), str.end(), 'a');   // 3, how many 'a'

if (str.find("split") != std::string::npos) {
    std::cout << "contains\n";
}
```

### Edit in place

```cpp
std::string x = "banana split";
x.replace(0, 6, "apple");              // "apple split" (start, length, new)
x.insert(0, "big ");                   // "big apple split"
x.erase(3, 6);                         // "big split" (start, length)
```

### Starts and ends with

`starts_with` and `ends_with` are C++20, not available here.

```cpp
std::string fn = "photo.png";
std::string suf = ".png";
bool starts = fn.rfind("photo", 0) == 0;                         // true
bool ends = fn.size() >= suf.size() &&
            fn.compare(fn.size() - suf.size(), suf.size(), suf) == 0;  // true
```

### Compare

```cpp
std::string("abc") == "abc";           // true, compares contents
std::string("apple") < "banana";       // true, dictionary order
std::string("Zebra") < "apple";        // true, uppercase sorts first
```

### Convert

```cpp
std::stoi("42");                       // 42, int
std::stoll("9000000000");              // long long
std::stod("3.5");                      // 3.5, double
std::stoi("12abc");                    // 12, stops at the first non-digit
std::to_string(7);                     // "7"
std::to_string(2.5);                   // "2.500000"
char d = '7';
int digit = d - '0';                   // 7
char c = 'a' + 2;                      // 'c'
```

### Case, trim, reverse, sort

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    {{code}}
    std::cout << u << '\n' << trimmed << '\n' << r << '\n';
}
```

```cpp
#include <algorithm>
#include <cctype>

std::string u = "Hello";
std::transform(u.begin(), u.end(), u.begin(),
               [](unsigned char ch) { return std::toupper(ch); });  // "HELLO"

std::string pad = "  hi  ";
std::size_t first = pad.find_first_not_of(' ');
std::size_t last = pad.find_last_not_of(' ');
std::string trimmed = pad.substr(first, last - first + 1);         // "hi", there is no trim()

std::string r = "abc";
std::reverse(r.begin(), r.end());      // "cba"
std::sort(r.begin(), r.end());         // "abc"
```

### Split and join

```cpp
#include <sstream>
#include <vector>

std::istringstream in("a b  c");
std::string word;
std::vector<std::string> words;
while (in >> word) words.push_back(word);          // {"a", "b", "c"}

std::istringstream csv("x,y,,z");
std::string part;
std::vector<std::string> parts;
while (std::getline(csv, part, ',')) parts.push_back(part);  // {"x", "y", "", "z"}

std::string joined;
for (std::size_t i = 0; i < parts.size(); i++) {
    if (i > 0) joined += "-";
    joined += parts[i];                            // "x-y--z"
}
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
