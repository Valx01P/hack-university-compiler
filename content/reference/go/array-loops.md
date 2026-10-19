# Looping Over Slices

Two ways: an index loop (`for i := 0; i < len(s); i++`) when you need control over the index, and `range` when you just want each element. Both work the same on slices and arrays.

### Index loop

```go
nums := []int{4, 8, 15}
for i := 0; i < len(nums); i++ {
	fmt.Println(i, nums[i])
}
// 0 4
// 1 8
// 2 15
```

### Range loop

```go
nums := []int{4, 8, 15}
for i, v := range nums {
	fmt.Println(i, v)
}
// 0 4
// 1 8
// 2 15

for _, v := range nums { // value only
	fmt.Print(v, " ")
}
// 4 8 15
```

### While-style loop

```go
nums := []int{4, 8, 15}
i := 0
for i < len(nums) {
	fmt.Print(nums[i], " ")
	i++
}
// 4 8 15
```

### Change elements in place

`v` is a copy, so write through the index.

```go
nums := []int{1, 2, 3}
for i := range nums {
	nums[i] *= 10
}
fmt.Println(nums) // [10 20 30]
```

### Sum, max, count

```go
nums := []int{3, 9, 2, 7}
sum, best, evens := 0, nums[0], 0
for _, v := range nums {
	sum += v
	if v > best {
		best = v
	}
	if v%2 == 0 {
		evens++
	}
}
fmt.Println(sum, best, evens) // 21 9 1
```

Average needs a conversion, since `int / int` drops the fraction:

```go harness
package main

import "fmt"

func main() {
	nums := []int{3, 9, 2, 7}
	sum := 21 // 3 + 9 + 2 + 7
	{{code}}
}
```

```go
avg := float64(sum) / float64(len(nums))
fmt.Printf("%.2f\n", avg) // 5.25
```

### Build a new slice

```go
import "strings"

words := []string{"go", "is", "fun"}
var upper []string
for _, w := range words {
	upper = append(upper, strings.ToUpper(w))
}
fmt.Println(upper) // [GO IS FUN]
```

### Filter

```go
nums := []int{1, 2, 3, 4, 5, 6}
var evens []int
for _, v := range nums {
	if v%2 == 0 {
		evens = append(evens, v)
	}
}
fmt.Println(evens) // [2 4 6]
```

### Stop early

```go
names := []string{"ana", "bo", "cy"}
found := -1
for i, n := range names {
	if n == "bo" {
		found = i
		break
	}
}
fmt.Println(found) // 1
```

### Print on one line

```go
nums := []int{1, 2, 3}
for i, v := range nums {
	if i > 0 {
		fmt.Print(", ")
	}
	fmt.Print(v)
}
fmt.Println()
// 1, 2, 3
```

### Which loop

| Loop | Use when |
| --- | --- |
| `for i := range s` | you need the index, or to modify `s[i]` |
| `for _, v := range s` | you only read each value |
| `for i := 0; i < len(s); i++` | you need odd steps, ranges, or reverse |
| `for i < len(s)` | the index moves by different amounts each pass |

### Gotchas

- `for _, v := range s { v *= 2 }` changes nothing in `s`. Use `s[i]`.
- `range` evaluates the slice once. Elements you `append` inside the loop are not visited.
- Ranging over an array (not a slice) copies the whole array first. Range over `arr[:]` or `&arr` if it is large.
- Declaring `i` or `v` without using it is a compile error. Use `_` for the one you skip.
