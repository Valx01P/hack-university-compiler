# Infinity and nil

Infinity exists only for floats: `math.Inf(1)` and `math.Inf(-1)`. Go's null is `nil`, and only pointers, slices, maps, channels, functions, interfaces, and `error` can be `nil`. An `int` or `string` can never be `nil`. It starts at its zero value (`0`, `""`) instead.

### Infinity

```go
import "math"

posInf := math.Inf(1)
negInf := math.Inf(-1)
fmt.Println(posInf, negInf)        // +Inf -Inf
fmt.Println(math.IsInf(posInf, 1)) // true
fmt.Println(math.IsInf(negInf, 0)) // true, 0 means either sign
fmt.Println(posInf > 1e308)        // true

zero := 0.0
fmt.Println(1/zero, -1/zero, zero/zero) // +Inf -Inf NaN
```

### NaN

```go
import "math"

nan := math.NaN()
fmt.Println(nan, math.IsNaN(nan)) // NaN true
fmt.Println(nan == nan)           // false, test with math.IsNaN
```

### Largest and smallest values

Ints have no infinity, so use the limits as starting values.

| Constant | Value |
| --- | --- |
| `math.MaxInt64` | 9223372036854775807 |
| `math.MinInt64` | -9223372036854775808 |
| `math.MaxInt32` | 2147483647 |
| `math.MaxFloat64` | 1.7976931348623157e+308 |
| `math.Inf(1)` | +Inf, float64 only |

### Use it in a loop

```go
import "math"

best := math.MaxInt64
worst := math.MinInt64
for _, n := range []int{5, 3, 8} {
	if n < best {
		best = n
	}
	if n > worst {
		worst = n
	}
}
fmt.Println(best, worst) // 3 8

lowest := math.Inf(1)
for _, t := range []float64{21.5, 18.2, 25.0} {
	lowest = math.Min(lowest, t)
}
fmt.Println(lowest) // 18.2
```

### nil

```go
var p *int
var s []int
var m map[string]int
var err error
fmt.Println(p == nil, s == nil, m == nil, err == nil) // true true true true
fmt.Println(p, s, m, err)                             // <nil> [] map[] <nil>
fmt.Println(len(s), len(m), m["x"])                   // 0 0 0
s = append(s, 1)                                      // appending to nil is fine

x := 5
p = &x
if p != nil {
	fmt.Println(*p) // 5
}
```

### Walk until nil

```go
type Node struct {
	Val  int
	Next *Node
}

list := &Node{1, &Node{2, nil}}
for n := list; n != nil; n = n.Next {
	fmt.Print(n.Val, " ")
}
fmt.Println()
// 1 2
```

### "No value" without nil

Go usually signals a missing value with a second result instead of `nil`.

```go
ages := map[string]int{"ada": 36}
if _, ok := ages["bob"]; !ok {
	fmt.Println("bob missing")
}

var name *string // a pointer when "no value" must be stored
if name == nil {
	fmt.Println("no name")
}
```

### Gotchas

- `var s string = nil` does not compile. Use `""`, or a `*string` if you need "unset".
- Writing to a nil map panics (`assignment to entry in nil map`). Create it with `make(map[string]int)` first. Reading is fine.
- Using a nil pointer panics: `p.Val` with `p == nil` gives `nil pointer dereference`. Check `p != nil` first.
- `nan == nan` is `false`, so `x == math.NaN()` never matches. Use `math.IsNaN(x)`.
