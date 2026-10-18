# 2D Arrays

A 2D array is an array of arrays: `grid[row][col]`. There is no special matrix type, and rows can even have different lengths.

### Create

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];

const rows = 3;
const cols = 4;
const board = Array.from({ length: rows }, () => new Array(cols).fill(0)); // 3 rows of 4 zeros
const table = Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => r * 3 + c));
console.log(JSON.stringify(table)); // [[0,1,2],[3,4,5],[6,7,8]]
```

### Access and update

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
grid[1][2];        // 6 (row 1, column 2)
grid.length;       // 2 (number of rows)
grid[0].length;    // 3 (number of columns)
grid[0][0] = 9;    // set one cell
grid.push([7, 8, 9]); // add a row
console.log(JSON.stringify(grid)); // [[9,2,3],[4,5,6],[7,8,9]]
```

### Loop with indexes

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
for (let r = 0; r < grid.length; r++) {
  for (let c = 0; c < grid[r].length; c++) {
    console.log(`grid[${r}][${c}] = ${grid[r][c]}`); // grid[0][0] = 1 ... grid[1][2] = 6
  }
}
```

### Loop with for...of and print as a grid

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
for (const row of grid) {
  console.log(row.join(" ")); // 1 2 3, then 4 5 6
}

let total = 0;
for (const row of grid) {
  for (const cell of row) total += cell;
}
console.log(total); // 21
```

### Column by column

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
for (let c = 0; c < grid[0].length; c++) {
  let colSum = 0;
  for (let r = 0; r < grid.length; r++) colSum += grid[r][c];
  console.log(`col ${c}: ${colSum}`); // col 0: 5, col 1: 7, col 2: 9
}
```

### Row sums and diagonals

```javascript
const m = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];
const rowSums = m.map((row) => row.reduce((s, x) => s + x, 0));
console.log(rowSums.join(" ")); // 6 15 24

let main = 0;
let anti = 0;
for (let i = 0; i < m.length; i++) {
  main += m[i][i];
  anti += m[i][m.length - 1 - i];
}
console.log(main, anti); // 15 15
```

### Neighbors with bounds checks

```javascript
const m = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];
const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
const r = 0;
const c = 1;
const found = [];
for (const [dr, dc] of dirs) {
  const nr = r + dr;
  const nc = c + dc;
  if (nr >= 0 && nr < m.length && nc >= 0 && nc < m[0].length) {
    found.push(m[nr][nc]);
  }
}
console.log(found.join(" ")); // 5 1 3
```

### Transpose, flatten, copy

```javascript
const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
const t = grid[0].map((_, c) => grid.map((row) => row[c]));
console.log(JSON.stringify(t)); // [[1,4],[2,5],[3,6]]
console.log(grid.flat().join(" ")); // 1 2 3 4 5 6

const copy = grid.map((row) => [...row]); // copies every row
copy[0][0] = 99;
console.log(grid[0][0]); // 1, the original is safe
```

| Call | Does |
| --- | --- |
| `Array.from({ length: r }, () => new Array(c).fill(0))` | r by c grid of zeros |
| `grid[r][c]` | one cell, row first |
| `grid.length` / `grid[0].length` | rows / columns |
| `row.join(" ")` | one row as text |
| `grid.flat()` | one flat array |
| `grid.map((row) => [...row])` | deep copy of a 2D array |
| `JSON.stringify(grid)` | print the whole thing on one line |

### Gotchas

- `new Array(3).fill(new Array(3).fill(0))` puts the *same* row in every slot, so changing `g[0][0]` changes every row. Build rows with `Array.from` and a callback.
- `[...grid]` and `grid.slice()` copy only the outer array. The rows are still shared.
- `grid[5][0]` throws `TypeError` because `grid[5]` is `undefined`. `grid[0][5]` quietly gives `undefined`. Check bounds first.
- `console.log(grid)` prints nested brackets. Print rows with `join` for a readable grid.
