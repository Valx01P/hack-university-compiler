# Built-ins and the math Package

Go has a small set of built-in functions (`len`, `append`, `make`, ...) that need no import. Everything numeric (`Pow`, `Sqrt`, `Max`) lives in `math` and works on `float64`. Go 1.16 has no built-in `min` or `max`, so for ints you write a three-line helper.

### Built-in functions (no import)

```go
s := make([]int, 0, 4) // make a slice, map, or channel
s = append(s, 7, 8)    // add to a slice
fmt.Println(len(s))    // 2, also works on strings, maps, arrays
fmt.Println(cap(s))    // 4

dst := make([]int, len(s))
copy(dst, s) // copy elements, returns the count

m := map[string]int{"a": 1}
delete(m, "a") // remove a map key

p := new(int) // pointer to a zero int
*p = 3
```

### min and max for ints

```go
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

fmt.Println(minInt(3, 7), maxInt(3, 7)) // 3 7
```

Max of a slice, in a loop:

```go
nums := []int{4, 9, 2}
best := nums[0]
for _, v := range nums[1:] {
	best = maxInt(best, v)
}
fmt.Println(best) // 9
```

### math (float64)

```go
import "math"

math.Max(3, 7)       // 7
math.Min(3, 7)       // 3
math.Pow(2, 10)      // 1024
math.Sqrt(16)        // 4
math.Cbrt(27)        // 3
math.Abs(-2.5)       // 2.5
math.Floor(2.7)      // 2
math.Ceil(2.1)       // 3
math.Round(2.5)      // 3 (half away from zero)
math.Trunc(-2.7)     // -2
math.Mod(7.5, 2)     // 1.5
math.Hypot(3, 4)     // 5
math.Log(math.E)     // 1
math.Log2(8)         // 3
math.Log10(1000)     // 3
fmt.Println(math.Pi) // 3.141592653589793
```

### Using math with ints

Convert in, then convert out.

```go
import "math"

n := 17
root := int(math.Sqrt(float64(n)))       // 4
big := int(math.Pow(2, 20))              // 1048576
bigger := maxInt(n, int(math.Pow(3, 3))) // 27
fmt.Println(root, big, bigger)
```

Exact integer power and absolute value without floats:

```go
func powInt(base, exp int) int {
	result := 1
	for i := 0; i < exp; i++ {
		result *= base
	}
	return result
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

fmt.Println(powInt(3, 4), absInt(-9)) // 81 9
```

Limits like `math.MaxInt64` and `math.Inf(1)` are in Infinity and nil. String and number conversions are in Variables and Types, sorting is in Slices and Arrays, and `math/rand` is in Standard Library.

### Built-ins at a glance

| Call | Does |
| --- | --- |
| `len(x)` | length of a string, slice, array, map, or channel |
| `cap(s)` | capacity of a slice |
| `append(s, v...)` | add elements, returns the new slice |
| `copy(dst, src)` | copy elements, returns how many |
| `make(T, n)` | new slice, map, or channel |
| `new(T)` | pointer to a zero `T` |
| `delete(m, k)` | remove a key from a map |
| `panic(v)` | stop with an error |
| `recover()` | catch a panic inside a deferred function |

### Gotchas

- `math.Max(a, b)` only takes `float64`. With ints, write `maxInt` or convert both ways.
- `math.MaxInt` and `math.MinInt` do not exist in Go 1.16 (they came in 1.17). Use `math.MaxInt64` and `math.MinInt64`.
- `2^10` is XOR (8), not a power. Use `math.Pow(2, 10)` or `1 << 10` for powers of two.
