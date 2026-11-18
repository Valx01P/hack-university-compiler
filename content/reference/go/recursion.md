# Recursion and Backtracking

A recursive function has a base case that stops and a recursive case that works on a smaller input. Backtracking builds a path one choice at a time: choose, recurse, then undo the choice. In Go the path is a slice, so save a copy with `append([]int(nil), path...)` when you record it, because later appends reuse the same backing array.

### Base case and recursive case

```go
func factorial(n int) int {
	if n <= 1 {
		return 1 // base case: stops the calls
	}
	return n * factorial(n-1) // a smaller problem each time
}

func sumDigits(n int) int {
	if n < 10 {
		return n
	}
	return n%10 + sumDigits(n/10)
}

fmt.Println(factorial(5), factorial(20)) // 120 2432902008176640000, int is 64 bits
fmt.Println(sumDigits(9045))             // 18
```

### A closure that calls itself

Declare it with `var` first. With `:=` the name doesn't exist yet inside its own body, and the call doesn't compile. A closure also sees the variables around it, so it needs fewer parameters.

```go
word := "level"
var isPal func(i, j int) bool
isPal = func(i, j int) bool {
	if i >= j {
		return true
	}
	return word[i] == word[j] && isPal(i+1, j-1)
}
fmt.Println(isPal(0, len(word)-1)) // true
```

### Subsets: take it or leave it

```go
nums := []int{1, 2, 3}
subsets := [][]int{}
path := []int{}
var dfs func(i int)
dfs = func(i int) {
	if i == len(nums) {
		subsets = append(subsets, append([]int(nil), path...)) // save a copy
		return
	}
	path = append(path, nums[i]) // take nums[i]
	dfs(i + 1)
	path = path[:len(path)-1] // undo
	dfs(i + 1)                // leave it
}
dfs(0)
fmt.Println(subsets) // [[1 2 3] [1 2] [1 3] [1] [2 3] [2] [3] []]
```

### Combinations: a start index

```go
func combine(n, k int) [][]int {
	out := [][]int{}
	path := []int{}
	var dfs func(start int)
	dfs = func(start int) {
		if len(path) == k {
			out = append(out, append([]int(nil), path...))
			return
		}
		for x := start; x <= n; x++ {
			path = append(path, x)
			dfs(x + 1) // only bigger numbers after x, so no repeats
			path = path[:len(path)-1]
		}
	}
	dfs(1)
	return out
}

fmt.Println(combine(4, 2)) // [[1 2] [1 3] [1 4] [2 3] [2 4] [3 4]]
```

### Permutations: a used slice

```go
nums := []int{1, 2, 3}
used := make([]bool, len(nums))
path := []int{}
perms := [][]int{}
var dfs func()
dfs = func() {
	if len(path) == len(nums) {
		perms = append(perms, append([]int(nil), path...))
		return
	}
	for i, x := range nums {
		if used[i] {
			continue
		}
		used[i] = true
		path = append(path, x)
		dfs()
		path = path[:len(path)-1] // undo both parts of the choice
		used[i] = false
	}
}
dfs()
fmt.Println(perms) // [[1 2 3] [1 3 2] [2 1 3] [2 3 1] [3 1 2] [3 2 1]], sorted input gives sorted output
```

### Combination sum: reuse and a running total

```go
import "sort"

candidates := []int{2, 3, 6, 7}
target := 7
sort.Ints(candidates) // sorted, so the loop can stop early
res := [][]int{}
path := []int{}
var dfs func(start, remain int)
dfs = func(start, remain int) {
	if remain == 0 {
		res = append(res, append([]int(nil), path...))
		return
	}
	for i := start; i < len(candidates) && candidates[i] <= remain; i++ {
		path = append(path, candidates[i])
		dfs(i, remain-candidates[i]) // i, not i + 1: the same number may repeat
		path = path[:len(path)-1]
	}
}
dfs(0, target)
fmt.Println(res) // [[2 2 3] [7]]
```

### N-Queens: columns and diagonals

On one diagonal `r + c` is the same, and on the other `r - c` is. Shift `r - c` by `n` so it's never negative.

```go
func nQueens(n int) int {
	cols, diag, anti := make([]bool, n), make([]bool, 2*n), make([]bool, 2*n)
	count := 0
	var place func(r int)
	place = func(r int) {
		if r == n {
			count++ // every row has a queen
			return
		}
		for c := 0; c < n; c++ {
			if cols[c] || diag[r+c] || anti[r-c+n] {
				continue
			}
			cols[c], diag[r+c], anti[r-c+n] = true, true, true
			place(r + 1)
			cols[c], diag[r+c], anti[r-c+n] = false, false, false
		}
	}
	place(0)
	return count
}

fmt.Println(nQueens(4), nQueens(8)) // 2 92
```

### Sort the results: by length, then element by element

```go
import "sort"

subsets := [][]int{{1, 2}, {3}, {}, {1, 3}, {2}, {1}}
sort.Slice(subsets, func(i, j int) bool {
	a, b := subsets[i], subsets[j]
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	for k := range a {
		if a[k] != b[k] {
			return a[k] < b[k]
		}
	}
	return false // equal
})
fmt.Println(subsets) // [[] [1] [2] [3] [1 2] [1 3]]
```

### Why the copy: a shared backing array

```go
path := make([]int, 0, 4)
path = append(path, 1, 2)
a := append(path, 3) // fits in path's spare room
b := append(path, 4) // the same room, so it overwrites a's 3
fmt.Println(a, b)    // [1 2 4] [1 2 4]

c := append(append([]int(nil), path...), 3) // a copy has its own array
fmt.Println(c, b)                           // [1 2 3] [1 2 4]
```

### Gotchas

- `out = append(out, path)` stores the shared slice, and later choices change every saved result. Store `append([]int(nil), path...)`.
- Undo every part of a choice (`used[i] = false` as well as the path), or later branches see stale state.
- Go's stack grows as needed (up to 1 GB), so deep recursion rarely crashes, but a missing base case still runs until the program is killed.
- Ranging over a map in a backtracking step visits keys in random order, so the results come out in a different order each run. Sort the keys first.
