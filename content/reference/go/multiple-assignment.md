# Multiple Assignment

Go assigns several variables in one statement: `a, b := 1, 2`. Every value on the right is evaluated before any variable changes, so swaps need no temp variable, and functions can return several values at once.

### Declare several at once

```go harness
package main

import "fmt"

func main() {

	{{code}}
	fmt.Println(host, port)
}
```

```go
x, y := 1, 2
var a, b int = 3, 4
var name, age = "Ada", 36          // types can differ
fmt.Println(x, y, a, b, name, age) // 1 2 3 4 Ada 36

var (
	host = "localhost"
	port = 8080
)
```

### Swap

```go
x, y := 1, 2
x, y = y, x
fmt.Println(x, y) // 2 1

nums := []int{10, 20, 30}
nums[0], nums[2] = nums[2], nums[0]
fmt.Println(nums) // [30 20 10]
```

### Multiple return values

```go
func divmod(a, b int) (int, int) {
	return a / b, a % b
}

q, r := divmod(17, 5)
fmt.Println(q, r)   // 3 2
_, r = divmod(9, 4) // the blank _ throws a value away
fmt.Println(r)      // 1
```

Declaring functions with several results, and named results, is in Functions.

### Value plus ok or err

```go
import "strconv"

n, err := strconv.Atoi("42")
m, err := strconv.Atoi("7") // fine: m is new, err is reused
fmt.Println(n, m, err)      // 42 7 <nil>

ages := map[string]int{"ada": 36}
v, ok := ages["bob"]
fmt.Println(v, ok) // 0 false
```

`:=` works as long as at least one name on the left is new.

### Use it in a loop

```go
// two indexes moving toward each other
nums := []int{30, 20, 10}
for i, j := 0, len(nums)-1; i < j; i, j = i+1, j-1 {
	nums[i], nums[j] = nums[j], nums[i]
}
fmt.Println(nums) // [10 20 30]

// Fibonacci: both update from the old values
a, b := 0, 1
for i := 0; i < 10; i++ {
	a, b = b, a+b
}
fmt.Println(a) // 55
```

### Gotchas

- `a, b := 3, 4` when both already exist fails with `no new variables on left side of :=`. Use `=`.
- There is no chained assignment: `a = b = 0` is a syntax error. Write `a, b = 0, 0`.
- The counts must match: `a, b, c := 1, 2` fails with `assignment mismatch`.
- In `i, j = i+1, j-1` the comma form is required. `i++, j--` is not valid Go.
