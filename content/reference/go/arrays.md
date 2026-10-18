# Slices and Arrays

A slice (`[]int`) is Go's dynamic list: it grows with `append` and is what you use almost always. An array (`[5]int`) has a fixed length that is part of its type, and it is copied when assigned or passed.

### Create

```go
nums := []int{3, 1, 4}     // slice literal
names := []string{}        // empty, ready to append
zeros := make([]int, 5)    // [0 0 0 0 0]
buf := make([]int, 0, 100) // len 0, room for 100 before regrowing
var none []int             // nil slice, len 0, append still works

arr := [3]int{1, 2, 3}        // array, fixed length 3
auto := [...]string{"a", "b"} // array, length counted for you (2)
```

### Add

```go
nums := []int{1, 2}
nums = append(nums, 3)    // [1 2 3]
nums = append(nums, 4, 5) // [1 2 3 4 5]
more := []int{6, 7}
nums = append(nums, more...) // [1 2 3 4 5 6 7]
```

### Access and update

```go
s := []string{"a", "b", "c", "d"}
fmt.Println(s[0])        // a
fmt.Println(s[len(s)-1]) // d (no s[-1] in Go)
s[1] = "B"
fmt.Println(len(s))       // 4
fmt.Println(s[1:3])       // [B c]  (start included, end excluded)
fmt.Println(s[:2], s[2:]) // [a B] [c d]
```

### Remove

```go
s := []int{10, 20, 30, 40, 50}
i := 1
s = append(s[:i], s[i+1:]...) // remove index 1, keeps order: [10 30 40 50]

last := s[len(s)-1]
s = s[:len(s)-1] // pop last: [10 30 40], last = 50

first := s[0]
s = s[1:] // pop front: [30 40], first = 10
```

### Insert at an index

```go
s := []int{1, 2, 4}
i := 2
s = append(s, 0)     // grow by one
copy(s[i+1:], s[i:]) // shift right
s[i] = 3
fmt.Println(s) // [1 2 3 4]
```

### Copy

```go
a := []int{1, 2, 3}
b := make([]int, len(a))
copy(b, a)                    // b is independent
c := append([]int(nil), a...) // same thing, one line
b[0] = 99
fmt.Println(a, b, c) // [1 2 3] [99 2 3] [1 2 3]
```

### Search

There is no `contains` for slices in Go 1.16, so loop.

```go
func indexOf(s []int, target int) int {
	for i, v := range s {
		if v == target {
			return i
		}
	}
	return -1
}

indexOf([]int{5, 8, 2}, 8) // 1
```

On a sorted slice, binary search with `sort`:

```go
import "sort"

s := []int{1, 3, 5, 7}
i := sort.SearchInts(s, 5)
found := i < len(s) && s[i] == 5 // i = 2, found = true
```

### Sort

```go
import "sort"

nums := []int{3, 1, 2}
sort.Ints(nums)                              // [1 2 3]
sort.Sort(sort.Reverse(sort.IntSlice(nums))) // [3 2 1]

words := []string{"pear", "fig", "apple"}
sort.Strings(words) // [apple fig pear]
sort.Slice(words, func(i, j int) bool {
	return len(words[i]) < len(words[j]) // by length
})
fmt.Println(words) // [fig pear apple]
```

### Print and join

```go
import "strings"

fmt.Println([]int{1, 2, 3})                          // [1 2 3]
fmt.Println(strings.Join([]string{"a", "b"}, ", "))  // a, b
fmt.Printf("%v %d\n", []int{4, 5}, len([]int{4, 5})) // [4 5] 2
```

### Use it in a loop

```go
var squares []int
for i := 1; i <= 5; i++ {
	squares = append(squares, i*i)
}
fmt.Println(squares) // [1 4 9 16 25]
```

### Calls you will use

| Call | Does |
| --- | --- |
| `len(s)` | number of elements |
| `cap(s)` | room before `append` must reallocate |
| `append(s, x, y)` | returns a slice with x and y added |
| `append(a, b...)` | adds every element of b |
| `make([]T, n)` | n zero values |
| `make([]T, 0, n)` | empty, with room for n |
| `copy(dst, src)` | copies min(len) elements, returns the count |
| `s[i:j]` | elements i to j-1, shares memory with s |
| `sort.Ints(s)` | sorts ints in place (also `sort.Strings`, `sort.Float64s`) |
| `sort.Slice(s, less)` | sorts by your compare function |
| `sort.SliceStable(s, less)` | same, keeps equal elements in order |
| `reflect.DeepEqual(a, b)` | compares two slices element by element |

### Gotchas

- `append` may return a new backing array, so always assign it back: `s = append(s, x)`. A bare `append(s, x)` does not compile.
- `s[1:3]` shares memory with `s`. Writing through the subslice changes the original. Use `copy` when you need independence.
- `==` does not work on slices (only against `nil`). Arrays can be compared with `==`.
- No `slices` package, no generics, no `min`/`max` built-ins in Go 1.16. Write the small loop.
