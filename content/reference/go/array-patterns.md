# Slice Loop Patterns

Anything beyond "each element once, front to back" is an index loop: you pick the start, the stop, and the step. All examples use `s := []int{10, 20, 30, 40, 50}`.

### Reverse

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
for i := len(s) - 1; i >= 0; i-- {
	fmt.Print(s[i], " ")
}
// 50 40 30 20 10
```

### Every other element

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
for i := 0; i < len(s); i += 2 { // even indexes
	fmt.Print(s[i], " ")
}
// 10 30 50

for i := 1; i < len(s); i += 2 { // odd indexes
	fmt.Print(s[i], " ")
}
// 20 40
```

### Skip by value

```go
nums := []int{1, 2, 3, 4, 5, 6}
for _, v := range nums {
	if v%2 != 0 {
		continue // skip odd values
	}
	fmt.Print(v, " ")
}
// 2 4 6
```

### Every nth, backwards

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
for i := len(s) - 1; i >= 0; i -= 2 {
	fmt.Print(s[i], " ")
}
// 50 30 10
```

### A range of indexes

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
for i := 1; i < 4; i++ { // indexes 1, 2, 3
	fmt.Print(s[i], " ")
}
// 20 30 40

for _, v := range s[1:4] { // same thing with a subslice
	fmt.Print(v, " ")
}
// 20 30 40
```

### Neighbors (each element with the next)

Stop one early so `i+1` stays in bounds.

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
for i := 0; i < len(s)-1; i++ {
	fmt.Print(s[i+1]-s[i], " ")
}
// 10 10 10 10
```

### Two pointers from both ends

```go
r := []int{1, 2, 3, 4}
for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
	r[i], r[j] = r[j], r[i] // reverse in place
}
fmt.Println(r) // [4 3 2 1]
```

### Every pair once

```go
t := []string{"a", "b", "c"}
for i := 0; i < len(t); i++ {
	for j := i + 1; j < len(t); j++ {
		fmt.Print(t[i], t[j], " ")
	}
}
// ab ac bc
```

### Wrap around with modulo

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
start := 3
for k := 0; k < len(s); k++ {
	fmt.Print(s[(start+k)%len(s)], " ")
}
// 40 50 10 20 30
```

### Running total (prefix sums)

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
}
```

```go
prefix := make([]int, len(s)+1)
for i, v := range s {
	prefix[i+1] = prefix[i] + v
}
fmt.Println(prefix)                // [0 10 30 60 100 150]
fmt.Println(prefix[4] - prefix[1]) // 90, the sum of s[1:4]
```

### Sliding window of size k

```go harness
package main

import "fmt"

func main() {
	s := []int{10, 20, 30, 40, 50}
	{{code}}
	fmt.Println()
}
```

```go
k, sum := 3, 0
for i, v := range s {
	sum += v
	if i >= k {
		sum -= s[i-k] // drop the element leaving the window
	}
	if i >= k-1 {
		fmt.Print(sum, " ")
	}
}
// 60 90 120
```

### Two slices side by side

```go
names := []string{"ana", "bo"}
ages := []int{31, 27}
for i := range names {
	fmt.Println(names[i], ages[i])
}
// ana 31
// bo 27
```

### Remove while looping (filter in place)

```go
nums := []int{1, 2, 3, 4, 5, 6}
keep := nums[:0] // reuses the same memory
for _, v := range nums {
	if v%3 != 0 {
		keep = append(keep, v)
	}
}
nums = keep
fmt.Println(nums) // [1 2 4 5]
```

### Cheat table

| Pattern | Loop header |
| --- | --- |
| reverse | `for i := len(s) - 1; i >= 0; i--` |
| every other | `for i := 0; i < len(s); i += 2` |
| odd indexes | `for i := 1; i < len(s); i += 2` |
| neighbors | `for i := 0; i < len(s)-1; i++` |
| both ends | `for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1` |
| pairs | `for j := i + 1; j < len(s); j++` inside an `i` loop |
| wrap around | `s[(start+k)%len(s)]` |

### Gotchas

- A reverse loop needs `i >= 0`, not `i > 0`, or it misses index 0.
- With unsigned indexes (`uint`) `i >= 0` is always true and `i--` wraps around. Use `int` for loop counters.
- Deleting with `append(s[:i], s[i+1:]...)` inside a forward loop skips the next element. Filter into a new slice, or loop backwards.
- `%` of a negative number is negative in Go (`-1 % 5` is `-1`). For wrap-around backwards use `((i % n) + n) % n`.
