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

### GCD and LCM (Euclid)

```go
func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

fmt.Println(gcd(48, 18))           // 6
fmt.Println(48 / gcd(48, 18) * 18) // 144, the lcm: divide first so it stays small
```

### Fast power under a modulus

Square the base for every bit of the exponent, and multiply it in where the bit is 1: O(log exp) steps. Both factors stay below `mod`, so with `int64` the product fits as long as `mod` is under about 3e9.

```go
func powMod(base, exp, mod int64) int64 {
	result := int64(1)
	base %= mod
	for exp > 0 {
		if exp&1 == 1 {
			result = result * base % mod // this bit is set: multiply it in
		}
		base = base * base % mod // the base for the next bit
		exp >>= 1
	}
	return result
}

fmt.Println(powMod(2, 10, 1000))          // 24, since 1024 % 1000 is 24
fmt.Println(powMod(2, 62, 1_000_000_007)) // 145586002
```

### Sieve of Eratosthenes

```go
n := 30
composite := make([]bool, n+1)
primes := []int{}
for i := 2; i <= n; i++ {
	if composite[i] {
		continue
	}
	primes = append(primes, i)
	for j := i * i; j <= n; j += i {
		composite[j] = true // every multiple of a prime is not prime
	}
}
fmt.Println(primes, len(primes)) // [2 3 5 7 11 13 17 19 23 29] 10
```

### Digits, limits, and overflow

`int` is 64 bits here. It wraps around with no error when it overflows, so check a result against the range a problem asks for.

```go
import "math"

n, rev := -123, 0
for n != 0 {
	rev = rev*10 + n%10 // % keeps the sign, so negatives work too
	n /= 10
}
fmt.Println(rev) // -321
big := 1 << 31
fmt.Println(big > math.MaxInt32, math.MinInt32) // true -2147483648, outside 32 bits

x := math.MaxInt64
x++
fmt.Println(x == math.MinInt64)                // true, it wrapped
fmt.Println(math.Inf(1) > 1e308, math.Inf(-1)) // true -Inf, float64 only
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
