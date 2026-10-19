# Math Operators

Go has the usual `+ - * / %`, and both sides of an operator must be the same type. `int / int` is integer division, and there is no `**`: use `math.Pow`.

### Arithmetic

```go
a, b := 17, 5
fmt.Println(a+b, a-b, a*b)           // 22 12 85
fmt.Println(a / b)                   // 3, int / int truncates
fmt.Println(a % b)                   // 2
fmt.Println(-7/2, -7%2)              // -3 -1, both round toward zero
fmt.Println(float64(a) / float64(b)) // 3.4
fmt.Println(17.0 / 5)                // 3.4
```

### Assignment operators

```go
x := 10
x += 5
fmt.Println(x) // 15
x -= 3
fmt.Println(x) // 12
x *= 2
fmt.Println(x) // 24
x /= 5
fmt.Println(x) // 4
x %= 3
fmt.Println(x) // 1
x++
fmt.Println(x) // 2
x--
fmt.Println(x) // 1
```

`x++` is a statement, not an expression: `y := x++` does not compile, and there is no `++x`.

### Powers and roots

```go
import "math"

fmt.Println(math.Pow(2, 10), math.Sqrt(16)) // 1024 4
fmt.Println(int(math.Pow(2, 10)))           // 1024, convert back to int
fmt.Println(1 << 10)                        // 1024, exact power of two for ints
```

`math` works on `float64`. Rounding, `math.Max`, logs, and the int `minInt` / `maxInt` / `absInt` helpers are in Built-ins and the math Package.

### Remainder that is never negative

`%` keeps the sign of the left side, so wrap indexes with a helper.

```go
func mod(a, b int) int {
	return (a%b + b) % b
}

fmt.Println(-7%3, mod(-7, 3)) // -1 2
```

### Use it in a loop

```go
sum := 0
for i := 1; i <= 10; i++ {
	if i%2 == 0 {
		sum += i * i
	}
}
fmt.Println(sum) // 220

digits := 0
for n := 12345; n > 0; n /= 10 {
	digits += n % 10
}
fmt.Println(digits) // 15

avg := float64(7+8+10) / 3
fmt.Printf("%.2f\n", avg) // 8.33
```

### Gotchas

- Mixing types fails: `x * f` with an int and a float64 gives `mismatched types int and float64`. Convert one side.
- `float64(7 / 2)` is `3`, because the int division happens first. Write `float64(7) / 2`.
- Integer division by a zero variable panics (`integer divide by zero`). Float division by zero gives `+Inf`.
- Floats are inexact: `0.1 + 0.2` stored in variables prints `0.30000000000000004`. Compare with `math.Abs(a-b) < 1e-9`.
