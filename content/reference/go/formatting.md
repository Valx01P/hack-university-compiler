# Printing Variables

Go has no string interpolation. Pass variables to `fmt.Println` (it adds spaces), or use `fmt.Printf` with verbs like `%d` and `%s`. `fmt.Sprintf` does the same but returns the string.

### Three ways

```go
import "strconv"

name := "Ada"
age := 36
fmt.Println("Name:", name, "Age:", age)       // Name: Ada Age: 36
fmt.Println("Age: " + strconv.Itoa(age))      // Age: 36
fmt.Printf("%s is %d years old\n", name, age) // Ada is 36 years old

msg := fmt.Sprintf("%s (%d)", name, age)
fmt.Println(msg) // Ada (36)
```

`+` only joins strings, so convert numbers with `strconv.Itoa` or `fmt.Sprint` first.

### Verbs

```go
pi := 3.14159
fmt.Printf("%v|%d|%s|%t\n", 42, 42, "go", true)       // 42|42|go|true
fmt.Printf("%f|%.2f|%e|%g\n", pi, pi, 1234.5, pi)     // 3.141590|3.14|1.234500e+03|3.14159
fmt.Printf("%q|%c|%U\n", "hi", 'G', 'G')              // "hi"|G|U+0047
fmt.Printf("%T|%T\n", pi, []int{})                    // float64|[]int
fmt.Printf("%b|%o|%x|%X|%#x\n", 10, 8, 255, 255, 255) // 1010|10|ff|FF|0xff
fmt.Printf("%d%%\n", 50)                              // 50%
```

| Verb | Prints |
| --- | --- |
| `%v` | any value in its default format |
| `%+v` | structs with field names |
| `%#v` | Go syntax, `main.Point{X:1, Y:2}` |
| `%T` | the type |
| `%d` | integer |
| `%f` `%.2f` | float, default 6 decimals or exactly 2 |
| `%e` `%g` | scientific, or shortest form |
| `%s` | string |
| `%q` | quoted string, or quoted rune |
| `%c` | a rune as a character |
| `%t` | bool |
| `%b` `%o` `%x` `%X` | binary, octal, hex |
| `%%` | a literal percent sign |

### Structs

```go
type Point struct {
	X, Y int
}

p := Point{1, 2}
fmt.Printf("%v|%+v|%#v\n", p, p, p) // {1 2}|{X:1 Y:2}|main.Point{X:1, Y:2}
```

### Width, padding, and sign

```go
fmt.Printf("[%5d]\n", 42)        // [   42]  right-aligned in 5
fmt.Printf("[%-5d]\n", 42)       // [42   ]  left-aligned
fmt.Printf("[%05d]\n", 42)       // [00042]  zero-padded
fmt.Printf("[%8.2f]\n", 3.14159) // [    3.14]
fmt.Printf("[%-8s]\n", "go")     // [go      ]
fmt.Printf("[%*d]\n", 6, 42)     // [    42]  width from an argument
fmt.Printf("%+d %+d\n", 5, -5)   // +5 -5
fmt.Printf("%08b\n", 5)          // 00000101
```

### Use it in a loop

```go
items := []string{"apple", "kiwi", "banana"}
prices := []float64{1.5, 0.25, 12}
for i, item := range items {
	fmt.Printf("%-8s $%6.2f\n", item, prices[i])
}
// apple    $  1.50
// kiwi     $  0.25
// banana   $ 12.00
```

### Gotchas

- `"Age: " + age` with an int `age` does not compile. Use `strconv.Itoa(age)` or `Printf`.
- A wrong verb still compiles and prints junk: `Printf("%d", "oops")` prints `%!d(string=oops)`, and a missing argument prints `%!d(MISSING)`.
- `Printf` adds no newline. Forgetting `\n` glues the next output onto the same line.
- `%v` on a float64 prints the shortest form (`3.5`, `1e+21`), so use `%.2f` when you need fixed decimals.
