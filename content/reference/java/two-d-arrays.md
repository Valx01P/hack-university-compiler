# 2D Arrays

A Java 2D array is an array of arrays: `grid[row][col]`. Each row is its own array, so rows can have different lengths.

### Create

```java
int[][] grid = new int[3][4];          // 3 rows, 4 columns, all 0
int[][] m = {
    {1, 2, 3},
    {4, 5, 6}
};

int rows = m.length;     // 2
int cols = m[0].length;  // 3, the length of row 0
int x = m[1][2];         // 6
m[0][0] = 9;             // m is now [[9, 2, 3], [4, 5, 6]]
```

### Print

```java
import java.util.Arrays;

System.out.println(Arrays.deepToString(m)); // [[9, 2, 3], [4, 5, 6]]
System.out.println(Arrays.toString(m));     // [[I@..., [I@...], row addresses
```

### Loop with indexes

```java
for (int r = 0; r < m.length; r++) {
    for (int c = 0; c < m[r].length; c++) {
        System.out.print(m[r][c] + " ");
    }
    System.out.println();
}
// 9 2 3
// 4 5 6
```

### Loop with for-each

```java
int total = 0;
for (int[] row : m) {
    for (int v : row) {
        total += v;
    }
}
System.out.println(total); // 29
```

### Column by column

```java
for (int c = 0; c < m[0].length; c++) {
    int colSum = 0;
    for (int r = 0; r < m.length; r++) {
        colSum += m[r][c];
    }
    System.out.print(colSum + " "); // 13 7 9
}
```

### Fill and char grids

```java
char[][] board = new char[3][3];
for (char[] row : board) {
    Arrays.fill(row, '.');
}
board[1][1] = 'X';
for (char[] row : board) {
    System.out.println(new String(row)); // ..., .X., ...
}
```

### Jagged rows

```java
int[][] tri = new int[4][];          // rows not created yet
for (int r = 0; r < tri.length; r++) {
    tri[r] = new int[r + 1];         // row r has r + 1 slots
}
System.out.println(Arrays.deepToString(tri)); // [[0], [0, 0], [0, 0, 0], [0, 0, 0, 0]]
```

### Neighbors with bounds checks

```java
int[][] dirs = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}}; // up, down, left, right
int row = 0;
int col = 1;
for (int[] d : dirs) {
    int nr = row + d[0];
    int nc = col + d[1];
    if (nr >= 0 && nr < m.length && nc >= 0 && nc < m[0].length) {
        System.out.print(m[nr][nc] + " "); // 5 9 3
    }
}
```

### Diagonal and transpose

```java
int[][] sq = {{1, 2}, {3, 4}};
int diag = 0;
for (int i = 0; i < sq.length; i++) {
    diag += sq[i][i];                 // 1 + 4 = 5
}

int[][] t = new int[m[0].length][m.length];
for (int r = 0; r < m.length; r++) {
    for (int c = 0; c < m[0].length; c++) {
        t[c][r] = m[r][c];
    }
}
// t is [[9, 4], [2, 5], [3, 6]]
```

### Copy

```java
int[][] copy = new int[m.length][];
for (int r = 0; r < m.length; r++) {
    copy[r] = m[r].clone();           // copy each row
}
```

### List of lists

```java
import java.util.ArrayList;
import java.util.List;

List<List<Integer>> table = new ArrayList<>();
for (int r = 0; r < 3; r++) {
    table.add(new ArrayList<>());     // add each inner list first
    for (int c = 0; c <= r; c++) {
        table.get(r).add(c);
    }
}
System.out.println(table);            // [[0], [0, 1], [0, 1, 2]]
System.out.println(table.get(2).get(1)); // 1
```

### Quick reference

| Need | Write |
| --- | --- |
| rows | `m.length` |
| columns in row `r` | `m[r].length` |
| one cell | `m[r][c]` |
| print all | `Arrays.deepToString(m)` |
| fill a row | `Arrays.fill(m[r], 0)` |
| sort rows by first value | `Arrays.sort(m, (a, b) -> Integer.compare(a[0], b[0]))` |

### Gotchas

- `m.clone()` and `Arrays.copyOf(m, n)` copy only the outer array. Both copies share the rows, so clone each row.
- `Arrays.toString(m)` prints row addresses. Use `Arrays.deepToString(m)`.
- The order is `[row][col]`, which is `[y][x]`, not `[x][y]`.
- `new int[3][]` leaves every row `null` until you create it.
