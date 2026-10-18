# 2D Lists

A 2D list is a list of lists, read as `grid[row][col]`. Build it with a comprehension so every row is its own list.

### Create

```python
m = [[1, 2, 3],
     [4, 5, 6]]
rows, cols = len(m), len(m[0])          # 2, 3

grid = [[0] * 3 for _ in range(2)]      # [[0, 0, 0], [0, 0, 0]]
board = [["."] * 4 for _ in range(4)]   # 4 x 4 of "."
table = [[r * c for c in range(1, 4)] for r in range(1, 4)]
table                                   # [[1, 2, 3], [2, 4, 6], [3, 6, 9]]
```

### Access and change

```python
m = [[1, 2, 3], [4, 5, 6]]
m[1][2]                         # 6
m[0]                            # [1, 2, 3]  a whole row
m[-1][-1]                       # 6  last row, last column
[row[1] for row in m]           # [2, 5]  a whole column
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
[sum(row) for row in m]         # [6, 15]
[sum(col) for col in zip(*m)]   # [5, 7, 9]
sum(sum(row) for row in m)      # 21
max(max(row) for row in m)      # 6
```

### Column by column, diagonal

```python
m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
for c in range(len(m[0])):
    for r in range(len(m)):
        print(m[r][c], end=" ")     # 1 4 7 2 5 8 3 6 9
print()

[m[i][i] for i in range(len(m))]            # [1, 5, 9]
[m[i][len(m) - 1 - i] for i in range(len(m))]   # [3, 5, 7]
```

### Transpose, flatten, copy

```python
import copy

m = [[1, 2, 3], [4, 5, 6]]
[list(col) for col in zip(*m)]  # [[1, 4], [2, 5], [3, 6]]
[x for row in m for x in row]   # [1, 2, 3, 4, 5, 6]

rows_copy = [row[:] for row in m]   # copies each row
deep = copy.deepcopy(m)             # copies any depth
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
