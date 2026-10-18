# If and Else

Go's `if` takes no parentheses around the condition, and the braces are always required, even for one line. `else` must sit on the same line as the closing `}`.

### If, else if, else

```go
temp := 25
if temp > 30 {
	fmt.Println("hot")
} else if temp > 20 {
	fmt.Println("warm") // warm
} else {
	fmt.Println("cold")
}
```

### If with a short statement

Run a statement before the condition. The variables it declares exist only inside the `if` and its `else` branches.

```go
import "strconv"

if n, err := strconv.Atoi("42"); err == nil {
	fmt.Println("number:", n) // number: 42
} else {
	fmt.Println("bad input:", err)
}
// n and err do not exist here

ages := map[string]int{"ada": 36}
if age, ok := ages["ada"]; ok {
	fmt.Println(age) // 36
}
```

### Check errors and return early

Idiomatic Go handles the bad case first and keeps the happy path unindented.

```go
import "strconv"

_, err := strconv.Atoi("x")
if err != nil {
	fmt.Println("error:", err) // error: strconv.Atoi: parsing "x": invalid syntax
	return
}
```

```go
func grade(score int) string {
	if score >= 90 {
		return "A"
	}
	if score >= 80 {
		return "B"
	}
	return "C"
}

fmt.Println(grade(85)) // B
```

### Set a value conditionally

```go
label := "odd"
if 4%2 == 0 {
	label = "even"
}
fmt.Println(label) // even
```

### Use it in a loop

```go
for i := 1; i <= 15; i++ {
	if i%15 == 0 {
		fmt.Print("FizzBuzz ")
	} else if i%3 == 0 {
		fmt.Print("Fizz ")
	} else if i%5 == 0 {
		fmt.Print("Buzz ")
	} else {
		fmt.Print(i, " ")
	}
}
fmt.Println()
// 1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz

for _, n := range []int{1, -2, 3, -4} {
	if n < 0 {
		continue // skip negatives
	}
	fmt.Print(n, " ")
}
fmt.Println() // 1 3
```

### Gotchas

- `}` and `else` on separate lines is a syntax error (`unexpected else`). Write `} else {`.
- `if x > 0 fmt.Println("a")` does not compile. Braces are mandatory, and `{` must be on the `if` line.
- A function that returns a value needs a `return` after its last `if` / `else if`, or you get `missing return at end of function`.
- `x := ...` inside an `if` block shadows an outer `x`, and the outer one stays unchanged. Use `=` to update it.
