# Looping Over Strings

A `std::string` is a sequence of `char`, so every vector loop works on it. Each item is a `char` (a small integer), which makes counting and character math easy.

### Each character

```cpp
#include <iostream>
#include <string>

std::string s = "code";
for (char c : s) {
    std::cout << c << ' ';            // c o d e
}

for (std::size_t i = 0; i < s.size(); i++) {
    std::cout << i << s[i] << ' ';    // 0c 1o 2d 3e
}

for (int i = (int)s.size() - 1; i >= 0; i--) {
    std::cout << s[i];                // edoc
}
```

### Change characters in place

```cpp
#include <cctype>   // toupper, tolower, isdigit, isalpha, isspace

std::string t = "hi there";
for (char& c : t) {
    c = std::toupper(static_cast<unsigned char>(c));
}
std::cout << t << '\n';   // HI THERE
```

### Count and classify

```cpp
std::string text = "Hi 2 you!";
int letters = 0, digits = 0, spaces = 0, vowels = 0;
for (char c : text) {
    unsigned char u = static_cast<unsigned char>(c);
    if (std::isalpha(u)) letters++;
    else if (std::isdigit(u)) digits++;
    else if (std::isspace(u)) spaces++;
    if (std::string("aeiouAEIOU").find(c) != std::string::npos) vowels++;
}
std::cout << letters << ' ' << digits << ' ' << spaces << ' ' << vowels << '\n';   // 5 1 2 3
```

### Build a new string

```cpp
std::string word = "a1b2c3";
std::string onlyLetters;
for (char c : word) {
    if (std::isalpha(static_cast<unsigned char>(c))) onlyLetters += c;
}
std::cout << onlyLetters << '\n';     // abc

std::string rev;
for (char c : word) rev = c + rev;
std::cout << rev << '\n';             // 3c2b1a
```

### Letter counts with an array

```cpp
std::string w = "banana";
int freq[26] = {};                    // all zeros
for (char c : w) {
    freq[c - 'a']++;                  // 'a' is 0, 'b' is 1, ...
}
for (int i = 0; i < 26; i++) {
    if (freq[i] > 0) std::cout << static_cast<char>('a' + i) << freq[i] << ' ';  // a3 b1 n2
}
```

### Digits to a number

```cpp
std::string num = "4096";
int value = 0;
for (char c : num) {
    value = value * 10 + (c - '0');
}
std::cout << value << '\n';   // 4096
```

### Neighbors and runs

```cpp
std::string r = "aaabcc";
int best = 1, run = 1;
for (std::size_t i = 1; i < r.size(); i++) {
    run = (r[i] == r[i - 1]) ? run + 1 : 1;
    if (run > best) best = run;
}
std::cout << best << '\n';   // 3, the "aaa" run
```

### Palindrome check (two pointers)

```cpp
std::string p = "racecar";
bool isPal = true;
for (int i = 0, j = (int)p.size() - 1; i < j; i++, j--) {
    if (p[i] != p[j]) {
        isPal = false;
        break;
    }
}
std::cout << std::boolalpha << isPal << '\n';   // true
```

To loop over words instead of characters, split with `std::istringstream` (see Strings).

| Call (from `<cctype>`) | True for |
|---|---|
| `std::isalpha(c)` | a letter |
| `std::isdigit(c)` | 0 to 9 |
| `std::isalnum(c)` | letter or digit |
| `std::isspace(c)` | space, tab, newline |
| `std::isupper(c)` / `std::islower(c)` | upper / lower case letter |
| `std::toupper(c)` / `std::tolower(c)` | returns the converted char as an `int` |

### Gotchas

- `std::cout << std::toupper(c)` prints a number, because it returns `int`. Store it in a `char` or cast with `static_cast<char>`.
- Pass `static_cast<unsigned char>(c)` to the `<cctype>` functions. A negative `char` (non-ASCII text) is undefined behavior.
- `rev = c + rev` builds a new string each time. For long strings use `std::reverse` instead.
- `c - '0'` and `c - 'a'` only make sense after checking `std::isdigit` or `std::islower`.
