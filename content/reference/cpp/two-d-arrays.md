# 2D Vectors and Arrays

A 2D grid in C++ is a vector of vectors, `std::vector<std::vector<int>>`. Index it `grid[row][col]`. Each row is its own vector, so rows can even have different lengths.

### Create

```cpp
#include <vector>

int rows = 3, cols = 4;
std::vector<std::vector<int>> grid(rows, std::vector<int>(cols, 0));  // 3x4 of zeros

std::vector<std::vector<int>> m = {
    {1, 2, 3},
    {4, 5, 6},
};
```

### Access and size

```cpp
#include <iostream>

std::cout << m[1][2] << '\n';       // 6, row 1, column 2
m[0][0] = 9;                        // {{9, 2, 3}, {4, 5, 6}}
m.size();                           // 2, number of rows
m[0].size();                        // 3, number of columns
```

### Loop with indexes

```cpp
std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
for (std::size_t r = 0; r < m.size(); r++) {
    for (std::size_t c = 0; c < m[r].size(); c++) {
        std::cout << m[r][c] << ' ';
    }
    std::cout << '\n';
}
// 1 2 3
// 4 5 6
```

### Loop with range-based for

```cpp
for (const auto& row : m) {         // const& avoids copying each row
    for (int x : row) {
        std::cout << x << ' ';
    }
    std::cout << '\n';
}

for (auto& row : m) {
    for (int& x : row) x *= 10;     // {{10, 20, 30}, {40, 50, 60}}
}
```

### Column by column

```cpp
std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
for (std::size_t c = 0; c < m[0].size(); c++) {
    for (std::size_t r = 0; r < m.size(); r++) {
        std::cout << m[r][c] << ' ';      // 1 4 2 5 3 6
    }
}
```

### Row sums and total

```cpp
int total = 0;
std::vector<int> rowSums;
for (const auto& row : m) {
    int s = 0;
    for (int x : row) s += x;
    rowSums.push_back(s);           // {6, 15}
    total += s;                     // 21
}
```

### Diagonals of a square grid

```cpp
std::vector<std::vector<int>> sq = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
int n = (int)sq.size();
for (int i = 0; i < n; i++) std::cout << sq[i][i] << ' ';          // 1 5 9
for (int i = 0; i < n; i++) std::cout << sq[i][n - 1 - i] << ' '; // 3 5 7
```

### Neighbors with a bounds check

```cpp
int R = (int)sq.size(), C = (int)sq[0].size();
int dr[] = {-1, 1, 0, 0};           // up, down, left, right
int dc[] = {0, 0, -1, 1};
int r = 0, c = 1;
for (int d = 0; d < 4; d++) {
    int nr = r + dr[d], nc = c + dc[d];
    if (nr >= 0 && nr < R && nc >= 0 && nc < C) {
        std::cout << sq[nr][nc] << ' ';   // 5 1 3
    }
}
```

### Transpose

```cpp
std::vector<std::vector<int>> t(m[0].size(), std::vector<int>(m.size()));
for (std::size_t i = 0; i < m.size(); i++) {
    for (std::size_t j = 0; j < m[0].size(); j++) {
        t[j][i] = m[i][j];          // 2x3 becomes 3x2
    }
}
```

### Jagged rows and character grids

```cpp
#include <string>

std::vector<std::vector<int>> tri;
for (int i = 1; i <= 3; i++) {
    tri.push_back(std::vector<int>(i, i));   // {{1}, {2, 2}, {3, 3, 3}}
}

std::vector<std::string> board = {
    "#..",
    ".#.",
};
board[1][1];                        // '#', a char
```

### Fixed-size grids

```cpp
#include <array>

int g[2][3] = {{1, 2, 3}, {4, 5, 6}};
int z[3][3] = {};                   // all zeros
std::array<std::array<int, 3>, 2> a = {{{1, 2, 3}, {4, 5, 6}}};
a[1][2];                            // 6
```

| Task | Code |
|---|---|
| rows | `m.size()` |
| columns | `m[0].size()` |
| make R x C filled with v | `std::vector<std::vector<int>> m(R, std::vector<int>(C, v))` |
| add a row | `m.push_back({7, 8, 9})` |
| in bounds | `r >= 0 && r < R && c >= 0 && c < C` |

### Gotchas

- `m[0].size()` on an empty grid is undefined behavior. Check `m.empty()` first.
- It is `m[row][col]`. Mixing them up with x and y (`m[x][y]`) is the classic grid bug.
- Passing a grid by value copies every row. Use `const std::vector<std::vector<int>>&` in function parameters.
- `std::vector<std::vector<int>> m(3)` makes 3 empty rows, so `m[0][0]` is out of bounds.
