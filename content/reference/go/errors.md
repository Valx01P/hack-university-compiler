# Errors, panic, and recover

Go has no try/catch. A function that can fail returns an `error` as its last value, and the caller checks `if err != nil` right away. `panic` and `recover` exist for bugs and truly broken states.

### Return and check an error

```go
import "errors"

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	return a / b, nil // nil means success
}

result, err := divide(10, 0)
if err != nil {
	fmt.Println("error:", err) // error: division by zero
	return
}
fmt.Println(result)
```

### Make errors

```go
import "errors"

e1 := errors.New("disk full")
e2 := fmt.Errorf("user %q not found", "bob")
fmt.Println(e1, "|", e2) // disk full | user "bob" not found
```

### Wrap with context, then inspect

`%w` in `fmt.Errorf` wraps the cause so `errors.Is` and `errors.As` can still find it.

```go
import "errors"

var ErrNotFound = errors.New("not found") // sentinel error

func load(id int) error {
	// ... the lookup failed with ErrNotFound
	return fmt.Errorf("load user %d: %w", id, ErrNotFound)
}

err := load(7)
fmt.Println(err)                               // load user 7: not found
fmt.Println(errors.Is(err, ErrNotFound))       // true
fmt.Println(err == ErrNotFound)                // false: it is wrapped
fmt.Println(errors.Unwrap(err) == ErrNotFound) // true
```

### Custom error type

Any type with an `Error() string` method is an `error`. Use `errors.As` to get it back with its fields.

```go
import "errors"

type ValidationError struct {
	Field string
	Msg   string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Msg
}

func validate(age int) error {
	if age < 0 {
		return &ValidationError{Field: "age", Msg: "must be >= 0"}
	}
	return nil
}

err := validate(-1)
var ve *ValidationError
if errors.As(err, &ve) {
	fmt.Println("bad field:", ve.Field) // bad field: age
}
```

### Errors in a loop

```go
import "strconv"

sum := 0
for _, s := range []string{"10", "x", "30"} {
	n, err := strconv.Atoi(s)
	if err != nil {
		fmt.Println("skip:", err) // skip: strconv.Atoi: parsing "x": invalid syntax
		continue
	}
	sum += n
}
fmt.Println(sum) // 40
```

### Standard errors to check for

```go
import (
	"errors"
	"os"
)

_, err := os.Open("missing.txt")
if errors.Is(err, os.ErrNotExist) {
	fmt.Println("no such file")
}
```

`io.EOF` means "input ended" and is the normal way readers stop, not a failure.

### defer: the finally block

Deferred calls run when the function returns, last in first out, even during a panic.

```go
import "os"

f, err := os.Open("data.txt")
if err != nil {
	return err
}
defer f.Close() // runs when the surrounding function exits
```

### panic and recover: the catch

```go
func safeDivide(a, b int) (result int, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered: %v", r)
		}
	}()
	return a / b, nil
}

fmt.Println(safeDivide(1, 0)) // 0 recovered: runtime error: integer divide by zero

panic("unreachable state") // crash on purpose, with a message and stack trace
```

| Call | Does |
| --- | --- |
| `errors.New("msg")` | new error |
| `fmt.Errorf("x %d: %w", n, err)` | formatted error, `%w` wraps `err` |
| `errors.Is(err, target)` | is `target` anywhere in the chain |
| `errors.As(err, &ptr)` | find an error of `ptr`'s type, fill `ptr` |
| `errors.Unwrap(err)` | one layer down, or `nil` |
| `panic(v)` / `recover()` | crash, or stop a crash inside a deferred func |
| `os.Exit(1)` | quit now, deferred calls do not run |

### Gotchas

- `if err := f(); err != nil` scopes `err` to the `if`. Writing `x, err := ...` inside a block can shadow an outer `err` by accident.
- Index out of range, nil map writes, nil pointer access, and integer division by zero are panics, not errors.
- Returning a nil `*ValidationError` as `error` gives a non-nil error. Return plain `nil` on success.
- `errors.Join` and multiple `%w` verbs are Go 1.20, not available here.
