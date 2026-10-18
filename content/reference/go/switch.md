# Switch

Go's `switch` does not fall through: only the matching `case` runs, so you never write `break`. A case can list several values, and a `switch` with no value is a cleaner `if` / `else if` chain.

### Match a value

```go
day := "sat"
switch day {
case "sat", "sun":
	fmt.Println("weekend") // weekend
case "mon":
	fmt.Println("start of week")
default:
	fmt.Println("weekday")
}
```

Cases work on any comparable type: ints, strings, runes, constants.

### Switch with no value

Each case is a bool condition, checked top to bottom.

```go
score := 85
switch {
case score >= 90:
	fmt.Println("A")
case score >= 80:
	fmt.Println("B") // B
default:
	fmt.Println("C")
}
```

### Short statement first

```go
switch n := 4; n {
case 1, 2, 3:
	fmt.Println("small")
case 4, 5, 6:
	fmt.Println("medium") // medium
}
```

### fallthrough

`fallthrough` runs the next case's body without checking its condition.

```go
switch 2 {
case 1:
	fmt.Println("one")
case 2:
	fmt.Println("two") // two
	fallthrough
case 3:
	fmt.Println("three") // three
case 4:
	fmt.Println("four")
}
```

### Type switch

```go
func describe(v interface{}) string {
	switch x := v.(type) {
	case int:
		return fmt.Sprintf("int %d", x)
	case string:
		return "string " + x
	case nil:
		return "nil"
	default:
		return fmt.Sprintf("other %T", x)
	}
}

fmt.Println(describe(42), describe("hi"), describe(2.5)) // int 42 string hi other float64
```

### Use it in a loop

```go
for _, c := range "a1 b" {
	switch {
	case c >= '0' && c <= '9':
		fmt.Print("digit ")
	case c == ' ':
		fmt.Print("space ")
	default:
		fmt.Print("letter ")
	}
}
fmt.Println() // letter digit space letter
```

`break` inside a `switch` only leaves the switch. To leave the loop, label it:

```go
loop:
for i := 0; ; i++ {
	switch {
	case i == 3:
		break loop // exits the for loop
	case i%2 == 0:
		continue
	}
	fmt.Println("odd", i) // odd 1
}
```

### Gotchas

- A `break` in a case does not stop the surrounding `for`. Use a label (`break loop`) or `return`.
- Two cases with the same constant fail to compile: `duplicate case 1 in switch`.
- `fallthrough` ignores the next case's condition and cannot be used in a type switch.
- Coming from C or Java: no `break` is needed at the end of each case, and adding one is harmless but noisy.
