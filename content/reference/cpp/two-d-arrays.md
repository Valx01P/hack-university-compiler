# 2D Vectors and Arrays

A 2D grid in C++ is a vector of vectors, `std::vector<std::vector<int>>`. Index it `grid[row][col]`. Each row is its own vector, so rows can even have different lengths.

### Create

```cpp
#include <vector>

int rows = 3, cols = 4;
std::vector<std::vector<int>> grid(rows, std::vector<int>(cols, 0));
std::cout << grid.size() << 'x' << grid[0].size() << '\n';   // 3x4 of zeros

std::vector<std::vector<int>> m = {
    {1, 2, 3},
    {4, 5, 6},
};
```

### Access and size

```cpp harness
std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
{{code}}
```

```cpp
#include <iostream>

std::cout << m[1][2] << '\n';       // 6, row 1, column 2
m[0][0] = 9;
std::cout << m[0][0] << '\n';       // 9
std::cout << m.size() << '\n';      // 2, number of rows
std::cout << m[0].size() << '\n';   // 3, number of columns
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

```cpp harness
std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
{{code}}
```

```cpp
for (const auto& row : m) {         // const& avoids copying each row
    for (int x : row) {
        std::cout << x << ' ';
    }
    std::cout << '\n';
}

for (auto& row : m) {
    for (int& x : row) x *= 10;
}
for (const auto& row : m) for (int x : row) std::cout << x << ' ';   // 10 20 30 40 50 60
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

```cpp harness
std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
{{code}}
```

```cpp
int total = 0;
std::vector<int> rowSums;
for (const auto& row : m) {
    int s = 0;
    for (int x : row) s += x;
    rowSums.push_back(s);
    total += s;
}
std::cout << total << '\n';                    // 21
for (int x : rowSums) std::cout << x << ' ';   // 6 15
```

### Diagonals of a square grid

```cpp
std::vector<std::vector<int>> sq = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
int n = (int)sq.size();
for (int i = 0; i < n; i++) std::cout << sq[i][i] << ' ';          // 1 5 9
for (int i = 0; i < n; i++) std::cout << sq[i][n - 1 - i] << ' '; // 3 5 7
```

### Neighbors with a bounds check

```cpp harness
std::vector<std::vector<int>> sq = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
{{code}}
std::cout << '\n';
```

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

For 8 neighbors, as in Game of Life, loop `dr` and `dc` both from -1 to 1 and skip the cell itself (`dr == 0 && dc == 0`). Read from a copy of the grid while you write the next step.

### Transpose

```cpp harness
void showGrid(const std::vector<std::vector<int>>& g) {
    for (const auto& row : g) {
        for (int x : row) std::cout << x << ' ';
        std::cout << '\n';
    }
}

std::vector<std::vector<int>> m = {{1, 2, 3}, {4, 5, 6}};
{{code}}
showGrid(t);
```

```cpp
std::vector<std::vector<int>> t(m[0].size(), std::vector<int>(m.size()));
for (std::size_t i = 0; i < m.size(); i++) {
    for (std::size_t j = 0; j < m[0].size(); j++) {
        t[j][i] = m[i][j];          // 2x3 becomes 3x2
    }
}
```

### Copy, rotate, and spiral

```cpp
#include <algorithm>

std::vector<std::vector<int>> sq = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
std::vector<std::vector<int>> copy = sq;           // a deep copy: every row is copied
copy[0][0] = 0;
std::cout << sq[0][0] << ' ' << copy[0][0] << '\n';   // 1 0

int n = static_cast<int>(sq.size());               // rotate 90 degrees clockwise in place
for (int i = 0; i < n; i++) {
    for (int j = i + 1; j < n; j++) std::swap(sq[i][j], sq[j][i]);   // transpose
}
for (auto& row : sq) std::reverse(row.begin(), row.end());           // then reverse each row
for (const auto& row : sq) for (int x : row) std::cout << x << ' ';  // 7 4 1 8 5 2 9 6 3
std::cout << '\n';

std::vector<std::vector<int>> m = {{1, 2, 3, 4}, {5, 6, 7, 8}, {9, 10, 11, 12}};
int top = 0, bottom = static_cast<int>(m.size()) - 1;
int left = 0, right = static_cast<int>(m[0].size()) - 1;
while (top <= bottom && left <= right) {           // spiral: four shrinking bounds
    for (int c = left; c <= right; c++) std::cout << m[top][c] << ' ';
    top++;
    for (int r = top; r <= bottom; r++) std::cout << m[r][right] << ' ';
    right--;
    if (top <= bottom) {
        for (int c = right; c >= left; c--) std::cout << m[bottom][c] << ' ';
        bottom--;
    }
    if (left <= right) {
        for (int r = bottom; r >= top; r--) std::cout << m[r][left] << ' ';
        left++;
    }
}
// 1 2 3 4 8 12 11 10 9 5 6 7
```

### Jagged rows and character grids

```cpp
#include <string>

std::vector<std::vector<int>> tri;
for (int i = 1; i <= 3; i++) {
    tri.push_back(std::vector<int>(i, i));
}
for (const auto& row : tri) for (int x : row) std::cout << x << ' ';   // 1 2 2 3 3 3
std::cout << '\n';

std::vector<std::string> board = {
    "#..",
    ".#.",
};
std::cout << board[1][1] << '\n';   // #, a char
```

### Fixed-size grids

```cpp
#include <array>

int g[2][3] = {{1, 2, 3}, {4, 5, 6}};
int z[3][3] = {};                   // all zeros
std::array<std::array<int, 3>, 2> a = {{{1, 2, 3}, {4, 5, 6}}};
std::cout << a[1][2] << '\n';       // 6
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
