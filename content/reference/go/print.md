# Printing

Printing lives in the `fmt` package, so every program that prints starts with `import "fmt"`. `fmt.Println` is the everyday call: it puts spaces between its arguments and a newline at the end.

### Print a line

```go
package main

import "fmt"

func main() {
	fmt.Println("Hello, World!") // Hello, World!
	fmt.Println("a", 1, true)    // a 1 true
	fmt.Println()                // empty line
}
```

### Without a newline

```go
fmt.Print("no newline")
fmt.Print("\n")

for i := 1; i <= 3; i++ {
	fmt.Print(i, " ")
}
fmt.Println() // 1 2 3
```

### Formatted

```go
fmt.Printf("%d items\n", 3) // 3 items
```

`Printf` never adds a newline, so end the format with `\n`. The verbs (`%d`, `%s`, `%v`, `%.2f`) are in Printing Variables.

### Escapes and raw strings

```go
fmt.Println("Tab:\tend")     // Tab:	end
fmt.Println("Quote: \"hi\"") // Quote: "hi"
fmt.Println(`C:\no\escapes`) // C:\no\escapes
fmt.Println(`line one
line two`) // prints two lines
```

Backticks make a raw string: no escapes, and it can span lines.

### Slices, maps, and structs

```go
type Point struct {
	X, Y int
}

fmt.Println([]int{1, 2, 3})                 // [1 2 3]
fmt.Println([]string{"a", "b"})             // [a b]
fmt.Println(map[string]int{"b": 2, "a": 1}) // map[a:1 b:2]
fmt.Println(Point{1, 2})                    // {1 2}
fmt.Printf("%+v\n", Point{1, 2})            // {X:1 Y:2}
fmt.Printf("%q\n", []string{"a", "b"})      // ["a" "b"]
```

`Println` of a map prints keys in sorted order, so it is safe for checked output.

### Standard error and fast output

```go
import (
	"bufio"
	"os"
)

fmt.Fprintln(os.Stderr, "error!") // goes to stderr, not stdout

w := bufio.NewWriter(os.Stdout)
defer w.Flush() // without this, nothing prints
for i := 0; i < 3; i++ {
	fmt.Fprintln(w, i)
}
```

Use a `bufio.Writer` when you print many thousands of lines.

### Build a string, then print it

```go
import "strings"

var sb strings.Builder
for i := 0; i < 3; i++ {
	fmt.Fprintf(&sb, "%d,", i)
}
fmt.Println(sb.String())             // 0,1,2,
fmt.Println(strings.Repeat("-", 10)) // ----------
```

| Call | Does |
| --- | --- |
| `fmt.Println(a, b)` | spaces between, newline at end |
| `fmt.Print(a, b)` | no newline, spaces only between non-strings |
| `fmt.Printf(format, a)` | formatted, no newline |
| `fmt.Sprintf(format, a)` | returns the string instead of printing |
| `fmt.Fprintln(w, a)` | prints to a writer (`os.Stderr`, a file, a builder) |

### Gotchas

- `fmt.Print("a", "b", 1, 2)` prints `ab1 2`: it only adds a space between two operands when neither is a string.
- An unused `"fmt"` import is a compile error, so remove it when you stop printing.
- `fmt.Println('A')` prints `65`, because a rune is a number. Use `string('A')` or `%c`.
- The built-in `println` writes to stderr. Always use `fmt.Println`.
