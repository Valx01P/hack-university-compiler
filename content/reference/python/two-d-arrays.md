# 2D Lists

A 2D list is a list of lists, read as `grid[row][col]`. Build it with a comprehension so every row is its own list.

### Create

```python
m = [[1, 2, 3],
     [4, 5, 6]]
rows, cols = len(m), len(m[0])
print(rows, cols)                       # 2 3

print([[0] * 3 for _ in range(2)])      # [[0, 0, 0], [0, 0, 0]]
board = [["."] * 4 for _ in range(4)]   # 4 x 4 of "."
table = [[r * c for c in range(1, 4)] for r in range(1, 4)]
print(table)                            # [[1, 2, 3], [2, 4, 6], [3, 6, 9]]
```

### Access and change

```python
m = [[1, 2, 3], [4, 5, 6]]
print(m[1][2])                  # 6
print(m[0])                     # [1, 2, 3]  a whole row
print(m[-1][-1])                # 6  last row, last column
print([row[1] for row in m])    # [2, 5]  a whole column
m[0][0] = 9                     # set one cell
m.append([7, 8, 9])             # add a row
```

### Loop by value

```python
m = [[1, 2, 3], [4, 5, 6]]
for row in m:
    for value in row:
        print(value, end=" ")
    print()
```

```text
1 2 3
4 5 6
```

### Loop by index (when you need r and c)

```python harness
m = [[1, 2, 3], [4, 5, 6]]
{{code}}
```

```python
for r in range(len(m)):
    for c in range(len(m[r])):
        m[r][c] *= 10           # change in place
print(m)                        # [[10, 20, 30], [40, 50, 60]]

for r, row in enumerate(m):
    for c, value in enumerate(row):
        if value == 50:
            print(r, c)         # 1 1
```

### Loop with while

```python
m = [[1, 2], [3, 4]]
r = 0
while r < len(m):
    c = 0
    while c < len(m[r]):
        print(m[r][c])          # 1, 2, 3, 4
        c += 1
    r += 1
```

### Row sums, column sums, total

```python
m = [[1, 2, 3], [4, 5, 6]]
print([sum(row) for row in m])         # [6, 15]
print([sum(col) for col in zip(*m)])   # [5, 7, 9]
print(sum(sum(row) for row in m))      # 21
print(max(max(row) for row in m))      # 6
```

### Column by column, diagonal

```python
m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
for c in range(len(m[0])):
    for r in range(len(m)):
        print(m[r][c], end=" ")     # 1 4 7 2 5 8 3 6 9
print()

print([m[i][i] for i in range(len(m))])            # [1, 5, 9]
print([m[i][len(m) - 1 - i] for i in range(len(m))])   # [3, 5, 7]
```

### Transpose, flatten, copy

```python
import copy

m = [[1, 2, 3], [4, 5, 6]]
print([list(col) for col in zip(*m)])  # [[1, 4], [2, 5], [3, 6]]
print([x for row in m for x in row])   # [1, 2, 3, 4, 5, 6]

rows_copy = [row[:] for row in m]   # copies each row
deep = copy.deepcopy(m)             # copies any depth
rows_copy[0][0] = 99
print(m[0][0], rows_copy[0][0])     # 1 99  the original is untouched
```

### Rotate 90 degrees clockwise

```python
m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
print([list(row) for row in zip(*m[::-1])])   # [[7, 4, 1], [8, 5, 2], [9, 6, 3]]  a new grid

n = len(m)                          # in place: transpose, then reverse each row
for r in range(n):
    for c in range(r + 1, n):
        m[r][c], m[c][r] = m[c][r], m[r][c]
for row in m:
    row.reverse()
print(m)                            # [[7, 4, 1], [8, 5, 2], [9, 6, 3]]
```

### Spiral order: four shrinking bounds

```python
m = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]
top, bottom, left, right = 0, len(m) - 1, 0, len(m[0]) - 1
out = []
while top <= bottom and left <= right:
    out += [m[top][c] for c in range(left, right + 1)]          # along the top
    top += 1
    out += [m[r][right] for r in range(top, bottom + 1)]        # down the right
    right -= 1
    if top <= bottom:
        out += [m[bottom][c] for c in range(right, left - 1, -1)]   # back along the bottom
        bottom -= 1
    if left <= right:
        out += [m[r][left] for r in range(bottom, top - 1, -1)]     # up the left
        left += 1
print(out)          # [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]
```

### All 8 neighbors, reading from a copy

A step that updates every cell from its neighbors (Game of Life) reads the old grid and writes the new one.

```python
board = [[0, 1, 0], [0, 1, 0], [0, 1, 0]]
rows, cols = len(board), len(board[0])
DIRS8 = [(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc]
old = [row[:] for row in board]
for r in range(rows):
    for c in range(cols):
        live = sum(old[r + dr][c + dc] for dr, dc in DIRS8
                   if 0 <= r + dr < rows and 0 <= c + dc < cols)
        board[r][c] = 1 if live == 3 or (old[r][c] and live == 2) else 0
print(board)        # [[0, 0, 0], [1, 1, 1], [0, 0, 0]]
```

### Neighbors in a grid

```python
grid = ["#..", ".#.", "..."]
r, c = 1, 1
for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    nr, nc = r + dr, c + dc
    if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]):
        print(nr, nc, grid[nr][nc])     # 0 1 ., 2 1 ., 1 0 ., 1 2 .
```

### Print a grid

```python
m = [[1, 2, 3], [4, 5, 6]]
for row in m:
    print(*row)                         # 1 2 3, 4 5 6
board = [list("#.."), list(".#.")]
for row in board:
    print("".join(row))                 # #.., .#.
```

Reading a grid from input is in User Input.

### Gotchas

- `[[0] * 3] * 2` repeats one row object: `g[0][0] = 1` changes both rows. Use `[[0] * 3 for _ in range(2)]`.
- Index with `m[r][c]`. `m[r, c]` is a `TypeError` (that is NumPy syntax).
- `m.copy()` and `m[:]` copy only the outer list, rows are still shared. Copy each row or use `copy.deepcopy`.
- Rows can have different lengths. Loop with `len(m[r])`, not a fixed `cols`, if they might.
