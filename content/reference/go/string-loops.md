# Looping Over Strings

`for i, r := range s` walks a string by character: `r` is a `rune` (a Unicode code point) and `i` is its byte offset. An index loop `for i := 0; i < len(s); i++` walks bytes, which is the same thing for plain ASCII.

### Range: characters

```go
for i, r := range "go!" {
	fmt.Println(i, r, string(r))
}
// 0 103 g
// 1 111 o
// 2 33 !
```

Print with `%c` and you get the character, not the number:

```go
for _, r := range "héllo" {
	fmt.Printf("%c ", r)
}
// h é l l o
```

### Index loop: bytes

```go
s := "hello"
for i := 0; i < len(s); i++ {
	fmt.Print(string(s[i]), " ")
}
// h e l l o
```

### Reverse

```go
s := "hello"
for i := len(s) - 1; i >= 0; i-- {
	fmt.Print(string(s[i]))
}
fmt.Println()
// olleh
```

For non-ASCII text, convert to runes first:

```go
r := []rune("héllo")
for i := len(r) - 1; i >= 0; i-- {
	fmt.Print(string(r[i]))
}
// olléh
```

### Count things

```go
import (
	"strings"
	"unicode"
)

s := "Hello World 42"
vowels, upper, digits := 0, 0, 0
for _, r := range s {
	switch {
	case strings.ContainsRune("aeiouAEIOU", r):
		vowels++
	case unicode.IsUpper(r):
		upper++
	case unicode.IsDigit(r):
		digits++
	}
}
fmt.Println(vowels, upper, digits) // 3 2 2
```

### Character frequency

```go
counts := map[rune]int{}
for _, r := range "banana" {
	counts[r]++
}
fmt.Println(counts['a'], counts['n']) // 3 2
```

For lowercase ASCII only, an array is faster:

```go
var freq [26]int
for _, r := range "banana" {
	freq[r-'a']++
}
fmt.Println(freq[0], freq['n'-'a']) // 3 2
```

### Build a new string

```go
import (
	"strings"
	"unicode"
)

var sb strings.Builder
for _, r := range "a1b2c3" {
	if unicode.IsLetter(r) {
		sb.WriteRune(unicode.ToUpper(r))
	}
}
fmt.Println(sb.String()) // ABC
```

### Digits to a number

```go
total := 0
for _, r := range "2024" {
	total = total*10 + int(r-'0')
}
fmt.Println(total) // 2024
```

### Palindrome check (two pointers)

```go
s := "racecar"
ok := true
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
	if s[i] != s[j] {
		ok = false
		break
	}
}
fmt.Println(ok) // true
```

### Words and lines

```go
import "strings"

for _, w := range strings.Fields("  the quick  fox ") {
	fmt.Print("[", w, "]")
}
fmt.Println()
// [the][quick][fox]

for i, line := range strings.Split("a\nb", "\n") {
	fmt.Println(i, line)
}
// 0 a
// 1 b
```

### Which loop

| Loop | Gives you |
| --- | --- |
| `for i, r := range s` | byte offset and `rune`, handles any UTF-8 |
| `for i := 0; i < len(s); i++` | index and `byte` via `s[i]`, ASCII only |
| `for _, b := range []byte(s)` | each byte |
| `for i, r := range []rune(s)` | character index and rune |

### Gotchas

- `s[i]` is a `byte` and `r` is a `rune`. Printing either with `Println` shows a number. Use `string(r)` or `%c`.
- In `range s`, `i` jumps by more than 1 after a multi-byte character (`"héllo"` gives 0, 1, 3, 4, 5). Use `[]rune(s)` when you need character positions.
- Comparing a byte with a rune literal works (`s[i] == 'a'`), but mixing `byte` and `rune` variables needs a conversion.
- `string(r - '0')` is not a digit string. Use `int(r - '0')` to get the number.
