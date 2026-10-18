# No Ternary Operator

Go has no `cond ? a : b`, on purpose. Set a default and override it with an `if`, or write a small helper function.

### Use an if instead

```go
age := 20
status := "minor"
if age >= 18 {
	status = "adult"
}
fmt.Println(status) // adult

// or declare first, then if / else
var label string
if age >= 65 {
	label = "senior"
} else {
	label = "regular"
}
fmt.Println(label) // regular
```

### A small helper function

Go 1.16 has no generics, so write one helper per type you need.

```go
func ifStr(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

score := 72
fmt.Println(ifStr(score >= 50, "pass", "fail")) // pass
```

For the common "pick the larger" case, `math.Max` covers float64 and the `maxInt` helper is in Built-ins and the math Package.

### Inline with a function literal

```go
n := -5
sign := func() string {
	if n < 0 {
		return "negative"
	}
	return "non-negative"
}()
fmt.Println(sign) // negative
```

### Use it in a loop

```go
for i := 1; i <= 3; i++ {
	word := "items"
	if i == 1 {
		word = "item"
	}
	fmt.Println(i, word)
}
// 1 item
// 2 items
// 3 items

for _, n := range []int{3, -1} {
	fmt.Println(n, ifStr(n >= 0, "positive", "negative"))
}
// 3 positive
// -1 negative
```

### Gotchas

- `x := cond ? a : b` fails with `invalid character U+003F '?'`.
- A helper like `ifStr` evaluates both arguments before the call, unlike a real ternary. `ifStr(len(s) > 0, s[:1], "")` still runs `s[:1]` when `s` is empty, which panics.
- `if` is a statement, not an expression, so `x := if ok { 1 } else { 2 }` is not valid Go either.
