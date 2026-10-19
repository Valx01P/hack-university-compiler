# 2D Slices and Arrays

A grid in Go is a slice of slices, `[][]int`. Each row is its own slice, so you allocate the rows yourself. A fixed `[3][4]int` array also works when the size is a constant.

### Create

```go
grid := [][]int{
	{1, 2, 3},
	{4, 5, 6},
}

var board [3][3]string // fixed size array, all ""
board[1][1] = "X"
fmt.Printf("%q\n", board) // [["" "" ""] ["" "X" ""] ["" "" ""]]
```

Sized at runtime, all zeros:

```go
rows, cols := 3, 4
m := make([][]int, rows)
for i := range m {
	m[i] = make([]int, cols)
}
fmt.Println(m) // [[0 0 0 0] [0 0 0 0] [0 0 0 0]]
```

### Access

```go
grid := [][]int{{1, 2, 3}, {4, 5, 6}}
fmt.Println(grid[1][2]) // 6 (row 1, column 2)
grid[0][0] = 9
fmt.Println(len(grid))    // 2 rows
fmt.Println(len(grid[0])) // 3 columns
fmt.Println(grid[1])      // [4 5 6], a whole row
```

### Loop with indexes

Rows on the outside, columns on the inside.

```go
grid := [][]int{{1, 2, 3}, {4, 5, 6}}
for r := 0; r < len(grid); r++ {
	for c := 0; c < len(grid[r]); c++ {
		fmt.Print(grid[r][c], " ")
	}
	fmt.Println()
}
// 1 2 3
// 4 5 6
```

### Loop with range

```go harness
package main

import "fmt"

func main() {
	grid := [][]int{{1, 2, 3}, {4, 5, 6}}
	{{code}}
	fmt.Println()
}
```

```go
for r, row := range grid {
	for c, v := range row {
		fmt.Printf("(%d,%d)=%d ", r, c, v)
	}
}
// (0,0)=1 (0,1)=2 (0,2)=3 (1,0)=4 (1,1)=5 (1,2)=6
```

### Column by column

```go harness
package main

import "fmt"

func main() {
	grid := [][]int{{1, 2, 3}, {4, 5, 6}}
	{{code}}
	fmt.Println()
}
```

```go
for c := 0; c < len(grid[0]); c++ {
	sum := 0
	for r := 0; r < len(grid); r++ {
		sum += grid[r][c]
	}
	fmt.Print(sum, " ")
}
// 5 7 9
```

### Row sums and the total

```go harness
package main

import "fmt"

func main() {
	grid := [][]int{{1, 2, 3}, {4, 5, 6}}
	{{code}}
}
```

```go
total := 0
for _, row := range grid {
	rowSum := 0
	for _, v := range row {
		rowSum += v
	}
	fmt.Print(rowSum, " ")
	total += rowSum
}
fmt.Println(total)
// 6 15 21
```

### Diagonals of a square grid

```go
sq := [][]int{{1, 2, 3}, {4, 5, 6}, {7, 8, 9}}
n := len(sq)
for i := 0; i < n; i++ {
	fmt.Print(sq[i][i], " ")     // main diagonal
	fmt.Print(sq[i][n-1-i], " ") // anti-diagonal
}
// 1 3 5 5 9 7
```

### Neighbors with bounds checks

```go
sq := [][]int{{1, 2, 3}, {4, 5, 6}, {7, 8, 9}}
r, c := 0, 1
dirs := [][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}} // up, down, left, right
for _, d := range dirs {
	nr, nc := r+d[0], c+d[1]
	if nr >= 0 && nr < len(sq) && nc >= 0 && nc < len(sq[nr]) {
		fmt.Print(sq[nr][nc], " ")
	}
}
// 5 1 3
```

### Transpose

```go
grid := [][]int{{1, 2, 3}, {4, 5, 6}}
t := make([][]int, len(grid[0]))
for c := range t {
	t[c] = make([]int, len(grid))
	for r := range grid {
		t[c][r] = grid[r][c]
	}
}
fmt.Println(t) // [[1 4] [2 5] [3 6]]
```

### Jagged rows and adding rows

Rows can have different lengths. `append` adds a whole row.

```go
tri := [][]int{}
for i := 1; i <= 3; i++ {
	row := make([]int, i)
	for j := range row {
		row[j] = i
	}
	tri = append(tri, row)
}
fmt.Println(tri) // [[1] [2 2] [3 3 3]]
```

### Grid from strings

```go
lines := []string{"#.#", "..#"}
cells := make([][]byte, len(lines))
for i, line := range lines {
	cells[i] = []byte(line)
}
cells[1][0] = '#'
fmt.Println(string(cells[1])) // #.#
```

### Print a grid

```go
import "strings"

board := [][]string{{"X", "O"}, {"O", "X"}}
for _, row := range board {
	fmt.Println(strings.Join(row, " | "))
}
// X | O
// O | X
```

### Gotchas

- `make([][]int, 3)` makes three `nil` rows. Writing `m[0][0] = 1` panics until you `make` each row.
- `grid[r][c]` is row first. Loop bounds are `len(grid)` for rows and `len(grid[r])` for columns, so mixing them up panics on non-square grids.
- Copying the outer slice (`b := grid`) does not copy the rows. Copy each row with `append([]int(nil), row...)`.
- Fixed arrays like `[3][3]int` are copied whole when assigned or passed. Slices of slices share their rows.
