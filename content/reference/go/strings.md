# Strings

A Go `string` is an immutable sequence of UTF-8 bytes. `len(s)` counts bytes and `s[i]` is a `byte`, so ASCII text behaves like you expect and accented letters or emoji take more than one byte. Most helpers live in the `strings` and `strconv` packages.

### Create

```go
s := "hello"
empty := ""                  // zero value of string
raw := `C:\path\no\escapes`  // backticks: raw, can span lines
quote := "she said \"hi\"\n" // double quotes: escapes work
fmt.Print(raw, " ", quote)   // C:\path\no\escapes she said "hi"
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

### Bytes and runes

`s[i]` and `len(s)` work in bytes. `range` and `[]rune(s)` work in runes, the characters.

```go
s := "héllo"
fmt.Println(len(s), len([]rune(s))) // 6 5, bytes then characters
fmt.Println(s[1], s[2])             // 195 169, the two bytes of é
for i, r := range s {
	fmt.Print(i, ":", string(r), " ") // each rune and its byte offset
}
fmt.Println() // 0:h 1:é 3:l 4:l 5:o
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
fmt.Println(strings.Contains(s, "nan")) // true
fmt.Println(strings.Index(s, "an"))     // 1 (-1 if missing)
fmt.Println(strings.LastIndex(s, "an")) // 3
fmt.Println(strings.HasPrefix(s, "ba")) // true
fmt.Println(strings.HasSuffix(s, "na")) // true
fmt.Println(strings.Count(s, "a"))      // 3
fmt.Println(strings.IndexByte(s, 'n'))  // 2
```

### Change (returns a new string)

```go
import "strings"

fmt.Println(strings.ToUpper("Go"))                 // GO
fmt.Println(strings.ToLower("Go"))                 // go
fmt.Println(strings.TrimSpace("  hi \n"))          // hi
fmt.Println(strings.Trim("--hi--", "-"))           // hi
fmt.Println(strings.TrimPrefix("v1.16", "v"))      // 1.16
fmt.Println(strings.TrimSuffix("file.go", ".go"))  // file
fmt.Println(strings.ReplaceAll("a-b-c", "-", "+")) // a+b+c
fmt.Println(strings.Replace("aaa", "a", "b", 2))   // bba (first 2 only)
fmt.Println(strings.Repeat("ab", 3))               // ababab
```

### Split and join

```go
import "strings"

fmt.Println(strings.Split("a,b,c", ","))            // [a b c]
fmt.Println(strings.SplitN("k=v=w", "=", 2))        // [k v=w], at most 2 parts
fmt.Println(strings.Fields("  one  two\tthree "))   // [one two three], splits on any whitespace
fmt.Println(strings.Join([]string{"x", "y"}, ", ")) // x, y
fmt.Println(strings.Split("abc", ""))               // [a b c], one string per character
```

### Compare

```go
import "strings"

fmt.Println("apple" == "apple")            // true
fmt.Println("apple" < "banana")            // true, byte by byte
fmt.Println(strings.EqualFold("Go", "GO")) // true, ignores case
```

### Numbers and strings: strconv

```go
import "strconv"

s := strconv.Itoa(-42)
fmt.Println(s + "!") // -42!
n, err := strconv.Atoi("123")
fmt.Println(n+1, err) // 124 <nil>
_, err = strconv.Atoi("12a")
fmt.Println(err) // strconv.Atoi: parsing "12a": invalid syntax
```

More conversions (`ParseFloat`, `FormatInt`) are in Variables and Types.

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

fmt.Println(unicode.IsLetter('a')) // true
fmt.Println(unicode.IsDigit('7'))  // true
fmt.Println(unicode.IsSpace(' '))  // true
fmt.Println(unicode.IsUpper('Q'))  // true
fmt.Println(unicode.ToUpper('q'))  // 81, the rune 'Q'
```

Digit character to number: `int(ch - '0')`.

### Letter arithmetic and counts

A byte or rune is a number, so `c - 'a'` is a letter's place in the alphabet, and a `[26]int` counts lowercase letters.

```go
word := "banana"
var counts [26]int
for i := 0; i < len(word); i++ {
	counts[word[i]-'a']++ // 'a' is 0, 'z' is 25
}
fmt.Println(counts[0], counts['n'-'a']) // 3 2
fmt.Println(string(rune('a' + 2)))      // c, back from a position
fmt.Println(int('7' - '0'))             // 7, a digit character to its value
```

### Palindrome and anagram checks

```go
func isPalindrome(s string) bool {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		if s[i] != s[j] {
			return false
		}
	}
	return true
}

func isAnagram(a, b string) bool {
	var count [26]int
	for i := 0; i < len(a); i++ {
		count[a[i]-'a']++
	}
	for i := 0; i < len(b); i++ {
		count[b[i]-'a']--
	}
	return count == [26]int{} // arrays compare with ==: every count is back to 0
}

fmt.Println(isPalindrome("racecar"), isPalindrome("go"))            // true false
fmt.Println(isAnagram("listen", "silent"), isAnagram("rat", "car")) // true false
```

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
| `strconv.Itoa(n)`, `strconv.Atoi(s)` | int to string, and string to int plus an error |
| `strings.Builder` | build a long string piece by piece |

### Gotchas

- `s += x` in a loop copies the whole string every time. Use `strings.Builder` for anything long.
- `s[i]` is a byte. For text with accents or emoji, loop with `range` or convert to `[]rune`.
- `s[0] = 'x'` does not compile, strings are immutable.
- `strings.Cut` does not exist in Go 1.16. Use `strings.Index` plus slicing, or `strings.SplitN(s, sep, 2)`.
