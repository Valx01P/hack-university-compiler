# Variables and Types

Go is statically typed: a variable's type is fixed when you declare it. Inside a function, `x := value` declares and infers the type, and every variable you declare must be used or the program will not compile.

### Declare

```go
var age int = 30
var name = "Ada" // type inferred: string
score := 9.5     // short form, inside functions only
age = 31         // = assigns to an existing variable

var (
	width  = 10
	height = 20
)
fmt.Println(age, name, score, width*height) // 31 Ada 9.5 200
```

At package level (outside `func`), only `var` works, never `:=`.

### Zero values

A variable declared without a value gets its type's zero value, never garbage.

```go
var n int
fmt.Println(n) // 0
var f float64
fmt.Println(f) // 0
var s string
fmt.Printf("%q\n", s) // ""
var ok bool
fmt.Println(ok) // false
var nums []int
fmt.Println(nums == nil, len(nums)) // true 0, still safe to append to
```

### Constants

```go
const Pi = 3.14159

const (
	StatusOK       = 200
	StatusNotFound = 404
)

type Weekday int

const (
	Sunday Weekday = iota
	Monday
	Tuesday
)
fmt.Println(Sunday, Monday, Tuesday) // 0 1 2
```

`iota` counts up by one in each line of a `const` block. It is Go's enum.

### Basic types

| Type | Holds |
| --- | --- |
| `int` | whole numbers, 64-bit here (max `math.MaxInt64`) |
| `int8` `int16` `int32` `int64` | sized signed ints |
| `uint8` `uint16` `uint32` `uint64` | unsigned ints |
| `float64` | decimals, the default for `3.14` |
| `float32` | smaller, less precise decimals |
| `string` | immutable UTF-8 text |
| `bool` | `true` or `false` |
| `byte` | alias for `uint8`, one byte of a string |
| `rune` | alias for `int32`, one Unicode character like `'A'` |

```go
fmt.Printf("%T %T %T %T %T\n", 42, 3.14, "hi", 'A', true)
// int float64 string int32 bool

var b byte = 'A'
var r rune = 'é'
fmt.Println(b, r) // 65 233
```

### Convert between types

Go never converts numbers for you. Write the conversion as `Type(value)`.

```go
i := 7
fmt.Println(float64(i) / 2) // 3.5
fl := 3.99
fmt.Println(int(fl)) // 3, truncates toward zero

var a int32 = 5
var c int64 = 6
fmt.Println(int64(a) + c) // 11
```

### Strings to numbers and back

```go
import "strconv"

s := strconv.Itoa(42)
fmt.Printf("%q\n", s) // "42"
n, err := strconv.Atoi("123")
fmt.Println(n, err) // 123 <nil>
_, err = strconv.Atoi("abc")
fmt.Println(err) // strconv.Atoi: parsing "abc": invalid syntax
f, _ := strconv.ParseFloat("2.5", 64)
ok, _ := strconv.ParseBool("true")
fmt.Println(strconv.FormatFloat(2.5, 'f', 2, 64)) // 2.50
fmt.Println(string(rune(65)))                     // A
fmt.Println(fmt.Sprint(3.5))                      // 3.5
```

| Call | Does |
| --- | --- |
| `strconv.Itoa(n)` | int to string |
| `strconv.Atoi(s)` | string to int, plus an error |
| `strconv.ParseFloat(s, 64)` | string to float64, plus an error |
| `strconv.ParseInt(s, base, 64)` | string in any base to int64 |
| `strconv.FormatInt(n, 2)` | int64 to a string in base 2 |
| `fmt.Sprint(v)` | any value to its printed string |

### Check a type in a loop

```go
values := []interface{}{1, "two", 3.0, true}
for _, v := range values {
	fmt.Printf("%v is %T\n", v, v)
}
// 1 is int
// two is string
// 3 is float64
// true is bool
```

### Gotchas

- An unused local variable is a compile error (`declared but not used`). Assign it to `_` or delete it.
- `string(65)` is `"A"`, not `"65"`. Use `strconv.Itoa` for digits.
- `int(3.99)` on a constant does not compile (`constant truncated to integer`). It only truncates a variable.
- `x := 1` inside an `if` or loop block makes a new variable that shadows the outer `x`. Use `=` to update the outer one.
