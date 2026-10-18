# Conditions and Logic

Conditions in Go must be a real `bool`. There is no truthiness: `if n` with an int, or `if s` with a string, does not compile. Logic is spelled `&&`, `||`, and `!`.

### Comparison operators

```go
a, b := 3, 5
fmt.Println(a == b, a != b) // false true
fmt.Println(a < b, a <= b)  // true true
fmt.Println(a > b, a >= b)  // false false
```

### Logical operators

```go
age, member := 20, false
fmt.Println(age >= 18 && member) // false
fmt.Println(age >= 18 || member) // true
fmt.Println(!member)             // true

isAdult := age >= 18 // a comparison is just a bool value
```

| Operator | Means |
| --- | --- |
| `==` `!=` | equal, not equal |
| `<` `<=` `>` `>=` | ordering, works on numbers and strings |
| `&&` | and, stops at the first `false` |
| `\|\|` | or, stops at the first `true` |
| `!` | not |

### Short-circuit guards

The right side only runs when it is needed, so put the safety check first.

```go
nums := []int{}
if len(nums) > 0 && nums[0] == 1 { // no index panic on an empty slice
	fmt.Println("starts with 1")
}

n := 0
if n == 0 || 10/n > 1 { // no divide by zero
	fmt.Println("ok")
}
```

### Ranges and combined checks

```go
x := 15
if x > 10 && x < 20 { // no 10 < x < 20 in Go
	fmt.Println("between") // between
}

fizzbuzz := x%3 == 0 && x%5 == 0
fmt.Println(fizzbuzz) // true
```

### Comparing strings and structs

```go
import "strings"

fmt.Println("apple" < "banana")               // true, byte by byte
fmt.Println("Go" == "go")                     // false
fmt.Println(strings.EqualFold("Go", "go"))    // true, ignores case
fmt.Println(strings.Contains("hello", "ell")) // true

type Point struct {
	X, Y int
}

fmt.Println(Point{1, 2} == Point{1, 2}) // true, field by field
```

Slices and maps cannot be compared with `==` (only to `nil`). Loop over them, or use `reflect.DeepEqual(a, b)` from `"reflect"`.

### Use it in a loop

```go
count := 0
for _, n := range []int{1, 2, 3, 4, 5, 6} {
	if n%2 == 0 && n > 2 {
		count++
	}
}
fmt.Println(count) // 2
```

### Gotchas

- `if n { }` with an int fails: `non-bool n (type int) used as if condition`. Write `if n != 0`.
- `1 < x < 10` does not compile. Write `1 < x && x < 10`.
- `and`, `or`, and `not` are not Go keywords. Use `&&`, `||`, `!`.
- `[]int{1} == []int{1}` fails with `slice can only be compared to nil`.
