# Strings

A Go `string` is an immutable sequence of UTF-8 bytes. `len(s)` counts bytes and `s[i]` is a `byte`, so ASCII text behaves like you expect and accented letters or emoji take more than one byte. Most helpers live in the `strings` and `strconv` packages.

### Create

```go
s := "hello"
empty := ""                  // zero value of string
raw := `C:\path\no\escapes`  // backticks: raw, can span lines
quote := "she said \"hi\"\n" // double quotes: escapes work
```

### Length, index, substring

```go
s := "hello"
fmt.Println(len(s))        // 5 (bytes)
fmt.Println(s[0])          // 104, a byte, not "h"
fmt.Println(string(s[0]))  // h
fmt.Println(s[1:4])        // ell
fmt.Println(s[len(s)-1:])  // o (last character)
fmt.Println(s[:2] + s[3:]) // helo
```

### Join pieces

```go
name, age := "Ana", 30
a := "Hi, " + name + "!"                          // + only joins strings
b := fmt.Sprintf("%s is %d years old", name, age) // build with any types

fmt.Println(a) // Hi, Ana!
fmt.Println(b) // Ana is 30 years old
```

In a loop, use `strings.Builder` instead of `+=`:

```go
import "strings"

var sb strings.Builder
for i := 0; i < 3; i++ {
	sb.WriteString("ab")
	sb.WriteByte('-')
}
fmt.Println(sb.String()) // ab-ab-ab-
```

### Search

```go
import "strings"

s := "banana"
strings.Contains(s, "nan") // true
strings.Index(s, "an")     // 1 (-1 if missing)
strings.LastIndex(s, "an") // 3
strings.HasPrefix(s, "ba") // true
strings.HasSuffix(s, "na") // true
strings.Count(s, "a")      // 3
strings.IndexByte(s, 'n')  // 2
```

### Change (returns a new string)

```go
import "strings"

strings.ToUpper("Go")                 // GO
strings.ToLower("Go")                 // go
strings.TrimSpace("  hi \n")          // hi
strings.Trim("--hi--", "-")           // hi
strings.TrimPrefix("v1.16", "v")      // 1.16
strings.TrimSuffix("file.go", ".go")  // file
strings.ReplaceAll("a-b-c", "-", "+") // a+b+c
strings.Replace("aaa", "a", "b", 2)   // bba (first 2 only)
strings.Repeat("ab", 3)               // ababab
```

### Split and join

```go
import "strings"

strings.Split("a,b,c", ",")            // [a b c]
strings.SplitN("k=v=w", "=", 2)        // [k v=w], at most 2 parts
strings.Fields("  one  two\tthree ")   // [one two three], splits on any whitespace
strings.Join([]string{"x", "y"}, ", ") // x, y
strings.Split("abc", "")               // [a b c], one string per character
```

### Compare

```go
import "strings"

fmt.Println("apple" == "apple")            // true
fmt.Println("apple" < "banana")            // true, byte by byte
fmt.Println(strings.EqualFold("Go", "GO")) // true, ignores case
```

Strings to numbers and back (`strconv.Atoi`, `strconv.Itoa`) are in Variables and Types.

### Change one character

Strings are read only. Convert to `[]byte` (ASCII) or `[]rune` (any text), edit, convert back.

```go
s := "cat"
b := []byte(s)
b[0] = 'b'
fmt.Println(string(b)) // bat

r := []rune("héllo")
r[1] = 'e'
fmt.Println(string(r), len(r)) // hello 5
```

### Reverse

```go
r := []rune("héllo")
for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
	r[i], r[j] = r[j], r[i]
}
fmt.Println(string(r)) // olléh
```

### Character tests

```go
import "unicode"

unicode.IsLetter('a') // true
unicode.IsDigit('7')  // true
unicode.IsSpace(' ')  // true
unicode.IsUpper('Q')  // true
unicode.ToUpper('q')  // 'Q' (a rune, prints as 81)
```

Digit character to number: `int(ch - '0')`.

### Calls you will use

| Call | Does |
| --- | --- |
| `len(s)` | length in bytes |
| `utf8.RuneCountInString(s)` | length in characters (`unicode/utf8`) |
| `strings.Contains(s, sub)` | sub appears in s |
| `strings.Index(s, sub)` | first position, or -1 |
| `strings.Split(s, sep)` | cut into a `[]string` |
| `strings.Fields(s)` | split on whitespace |
| `strings.Join(parts, sep)` | glue a `[]string` together |
| `strings.TrimSpace(s)` | strip leading and trailing whitespace |
| `strings.ReplaceAll(s, old, new)` | replace every match |
| `strings.ToUpper(s)` | uppercase copy (also `ToLower`) |
| `fmt.Sprintf(format, ...)` | format anything into a string |

### Gotchas

- `s += x` in a loop copies the whole string every time. Use `strings.Builder` for anything long.
- `s[i]` is a byte. For text with accents or emoji, loop with `range` or convert to `[]rune`.
- `s[0] = 'x'` does not compile, strings are immutable.
- `strings.Cut` does not exist in Go 1.16. Use `strings.Index` plus slicing, or `strings.SplitN(s, sep, 2)`.
