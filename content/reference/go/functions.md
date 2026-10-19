# Functions

Declare with `func name(params) returnType`. Types come after names, a function can return several values, and there are no default arguments or overloading. Functions are declared at the top level, outside `main`.

### Declare and call

```go harness
package main

import "fmt"

{{code}}
```

```go
func add(a int, b int) int {
	return a + b
}

func greet(name string) { // no return value
	fmt.Println("hi", name)
}

func main() {
	fmt.Println(add(2, 3)) // 5
	greet("Ana")           // hi Ana
}
```

Parameters of the same type can share it: `func add(a, b int) int`.

### Multiple return values

List the result types in parentheses and return them comma separated.

```go
func minMax(nums []int) (int, int) {
	lo, hi := nums[0], nums[0]
	for _, v := range nums[1:] {
		if v < lo {
			lo = v
		}
		if v > hi {
			hi = v
		}
	}
	return lo, hi
}

lo, hi := minMax([]int{4, 9, 1}) // 1 9
_, hi = minMax([]int{2, 5})      // keep one, drop the other with _
```

When a call can fail, return a value plus an `error` last. That pattern is in Errors, panic, and recover.

### Named results

Named results start at their zero value. A bare `return` sends them back.

```go
func stats(nums []int) (sum, largest int) {
	for i, v := range nums {
		sum += v
		if i == 0 || v > largest {
			largest = v
		}
	}
	return
}

total, top := stats([]int{3, 9, 4}) // 16 9
```

### Variadic (any number of arguments)

```go
func sum(nums ...int) int { // nums is a []int
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}

sum()               // 0
sum(1, 2, 3)        // 6
sum([]int{4, 5}...) // 9, spread a slice with ...
```

### Slices, maps, and pointers as arguments

Arguments are copied. A slice or map copy still points at the same data, so changes to elements show up for the caller. Pass a pointer to change a plain value.

```go
func double(s []int) {
	for i := range s {
		s[i] *= 2
	}
}

func reset(n *int) {
	*n = 0
}

nums := []int{1, 2}
double(nums)
fmt.Println(nums) // [2 4]

x := 5
reset(&x)
fmt.Println(x) // 0
```

### Function values and closures

```go
func apply(nums []int, f func(int) int) []int {
	out := make([]int, 0, len(nums))
	for _, v := range nums {
		out = append(out, f(v))
	}
	return out
}

square := func(n int) int { return n * n }
fmt.Println(square(4))                     // 16
fmt.Println(apply([]int{1, 2, 3}, square)) // [1 4 9]
```

A closure keeps the variables it captures:

```go
func counter() func() int {
	n := 0
	return func() int {
		n++
		return n
	}
}

next := counter()
next()
fmt.Println(next()) // 2
```

### Recursion

```go
func fact(n int) int {
	if n <= 1 {
		return 1
	}
	return n * fact(n-1)
}

fmt.Println(fact(5)) // 120
```

A recursive closure must be declared first, then assigned:

```go
var fib func(int) int
fib = func(n int) int {
	if n < 2 {
		return n
	}
	return fib(n-1) + fib(n-2)
}
fmt.Println(fib(10)) // 55
```

### Defer

`defer` runs a call when the function returns, last in first out.

```go
func work() {
	defer fmt.Println("done")
	fmt.Println("working")
}

work()
// working
// done
```

### Syntax at a glance

| Form | Means |
| --- | --- |
| `func f(a, b int) int` | two int params, one int result |
| `func f() (int, error)` | two results, error last |
| `func f() (x, y int)` | named results, bare `return` allowed |
| `func f(xs ...string)` | variadic, `xs` is a `[]string` |
| `f(list...)` | pass a slice to a variadic |
| `func(int) bool` | the type of a function value |
| `func(x int) int { return x }` | function literal (anonymous) |

### Gotchas

- No default parameter values and no overloading. Use different names or a variadic.
- A `func` declaration cannot go inside another function. Inside `main`, write `name := func(...) {...}`.
- Calling a multi-value function where one value is expected does not compile. Unpack with `a, b := f()`.
- Unused parameters are fine, but unused local variables and imports are compile errors.
