# User Input

Read input with `std::cin` from `<iostream>`. `std::cin >> x` reads one whitespace-separated token and converts it to `x`'s type. `std::getline(std::cin, line)` reads a whole line, spaces included.

### Read values

```cpp
#include <iostream>
#include <string>

int n;
double price;
std::string word;
std::cin >> n >> price >> word;   // input "3 9.99 apple" (spaces or newlines)

std::string line;
std::getline(std::cin, line);     // whole line, without the '\n'
```

### Mixing `>>` and `getline`

`>>` leaves the newline behind, so a `getline` right after it reads an empty line. Skip it first.

```cpp
#include <limits>

int age;
std::cin >> age;
std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');  // drop rest of line
std::string fullName;
std::getline(std::cin, fullName);   // "Ana Lopez"

// shorter: std::getline(std::cin >> std::ws, fullName);  skips leading whitespace
```

### Into an array: count first, then values

```cpp
#include <vector>

// input: 4
//        10 20 30 40
int n;
std::cin >> n;
std::vector<int> nums(n);
for (int i = 0; i < n; i++) {
    std::cin >> nums[i];
}
```

### Read until input runs out

```cpp
int x, sum = 0;
while (std::cin >> x) {     // stops at end of input or on a non-number
    sum += x;
}

std::string line;
while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    // use line
}
```

### Split a line into parts

```cpp
#include <sstream>

std::string line = "7 3 12";             // e.g. from getline
std::istringstream in(line);
std::vector<int> parts;
int v;
while (in >> v) parts.push_back(v);      // {7, 3, 12}
```

Splitting on a comma, and `std::stoi` for turning text into a number, are in Strings.

### Into a grid

```cpp
// input: 2 3
//        #..
//        .#.
int rows, cols;
std::cin >> rows >> cols;
std::vector<std::string> grid(rows);
for (auto& row : grid) std::cin >> row;   // grid[1][1] is '#'

std::vector<std::vector<int>> nums(rows, std::vector<int>(cols));
for (auto& row : nums) {
    for (int& x : row) std::cin >> x;     // a grid of numbers, row by row
}
```

### Into a map or set

```cpp
#include <map>
#include <set>

// input: the cat and the hat
std::map<std::string, int> counts;
std::set<std::string> distinct;
std::string w;
while (std::cin >> w) {
    counts[w]++;
    distinct.insert(w);
}
counts["the"];    // 2
distinct.size();  // 4
```

### Into objects

```cpp
struct Student {
    std::string name;
    int grade;
};

// input: 2
//        ana 90
//        bo 75
int n;
std::cin >> n;
std::vector<Student> students;
for (int i = 0; i < n; i++) {
    Student s;
    std::cin >> s.name >> s.grade;
    students.push_back(s);
}
```

### Check for bad input

```cpp
int n;
if (!(std::cin >> n)) {          // user typed "abc" or input ended
    std::cin.clear();            // reset the error state
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    std::cout << "not a number\n";
}
```

| Call | Does |
|---|---|
| `std::cin >> x` | read one token into `x` |
| `std::getline(std::cin, s)` | read a whole line |
| `std::getline(in, s, ',')` | read up to a delimiter |
| `std::cin >> std::ws` | skip leading whitespace |
| `std::cin.ignore(n, '\n')` | discard up to `n` chars or the next newline |
| `std::cin.clear()` | clear the fail state after bad input |
| `std::istringstream in(s)` | read from a string like it's `cin` |
| `std::ios::sync_with_stdio(false);` | faster `cin` for big inputs (first line of `main`) |

### Gotchas

- `getline` after `>>` returns an empty string. Use `std::cin.ignore(...)` or `std::cin >> std::ws` first.
- Once `std::cin` fails, every later read fails too until you call `std::cin.clear()`.
- `std::cin >> s` into a string stops at the first space. Use `getline` for names or sentences.
- When `std::cin >> n` meets text like `abc`, it sets `n` to 0 and fails. Check the stream, not the value.
