# Reading Input

Read whole lines with `bufio.Scanner` (or `bufio.Reader`), or read whitespace-separated values with `fmt.Scan`. Input arrives as text, so convert numbers with `strconv.Atoi`.

### One line

```stdin
Ann
```

```go
import (
	"bufio"
	"os"
	"strings"
)

reader := bufio.NewReader(os.Stdin)
fmt.Print("Name: ")
name, _ := reader.ReadString('\n') // includes the '\n'
name = strings.TrimSpace(name)
fmt.Println("Hi,", name) // Hi, Ann
```

### Values separated by spaces or newlines

`fmt.Scan` skips any whitespace, newlines included, and fills the variables you point it at.

```stdin
Ann 30
```

```go
var name string
var age int
fmt.Scan(&name, &age)    // input: Ann 30
fmt.Println(name, age+1) // Ann 31
```

### A count, then that many numbers into a slice

```stdin
3
1 2 3
```

```go
var n int
fmt.Scan(&n) // input: 3 then 1 2 3
nums := make([]int, n)
for i := range nums {
	fmt.Scan(&nums[i])
}
fmt.Println(nums) // [1 2 3]
```

### Numbers on one line into a slice

```stdin
4 x 7 1
```

```go
import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

sc := bufio.NewScanner(os.Stdin)
sc.Scan() // reads one line, input: 4 x 7 1
nums := []int{}
for _, f := range strings.Fields(sc.Text()) {
	x, err := strconv.Atoi(f)
	if err != nil {
		fmt.Println("not a number:", f)
		continue
	}
	nums = append(nums, x)
}
fmt.Println(nums) // [4 7 1], after "not a number: x"
```

### Lines into structs, a map, and a set

```go harness
package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func main() {
	sc := bufio.NewScanner(os.Stdin)
	{{code}}
}
```

```stdin
3
ann 90
bob 80
ann 5
```

```go
type Student struct {
	Name  string
	Score int
}

// input: a count line "3", then "ann 90", "bob 80", "ann 5"
sc.Scan() // the same sc as above
count, _ := strconv.Atoi(strings.TrimSpace(sc.Text()))
students := []Student{}
scores := map[string]int{}
seen := map[string]bool{}
for i := 0; i < count && sc.Scan(); i++ {
	parts := strings.Fields(sc.Text())
	score, _ := strconv.Atoi(parts[1])
	students = append(students, Student{parts[0], score})
	scores[parts[0]] += score
	seen[parts[0]] = true
}
fmt.Println(students)  // [{ann 90} {bob 80} {ann 5}]
fmt.Println(scores)    // map[ann:95 bob:80]
fmt.Println(len(seen)) // 2
```

### Every line until the end of input

```go harness
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main() {
	sc := bufio.NewScanner(os.Stdin)
	{{code}}
}
```

```stdin
a,b,c
```

```go
for sc.Scan() { // false at end of input
	line := sc.Text() // no trailing '\n'
	if line == "" {
		continue
	}
	items := strings.Split(line, ",")
	fmt.Println(len(items), items) // input a,b,c: 3 [a b c]
}
```

### Fast token reading until EOF

```stdin
10 20 30
```

```go
import (
	"bufio"
	"os"
)

in := bufio.NewReader(os.Stdin)
sum := 0
for {
	var x int
	if _, err := fmt.Fscan(in, &x); err != nil {
		break // io.EOF, or a token that is not a number
	}
	sum += x
}
fmt.Println(sum) // input 10 20 30: 60
```

| Call | Does |
| --- | --- |
| `bufio.NewScanner(os.Stdin)` | line reader: `sc.Scan()` then `sc.Text()` |
| `sc.Buffer(make([]byte, 1<<20), 1<<20)` | allow lines longer than 64 KB |
| `reader.ReadString('\n')` | one line, keeps the `'\n'` |
| `fmt.Scan(&a, &b)` | whitespace-separated values |
| `fmt.Fscan(in, &x)` | same, from a buffered reader (much faster) |
| `fmt.Sscan(s, &x)` / `fmt.Sscanf(s, "age=%d", &x)` | parse from a string |
| `strings.Fields(line)` | split on runs of spaces |
| `strconv.Atoi(s)` / `strconv.ParseFloat(s, 64)` | text to number |

### Gotchas

- `fmt.Scan(&s)` reads one word, not a line. Use a `Scanner` or `ReadString` for text with spaces.
- `ReadString('\n')` keeps the newline (and `\r` from Windows input). Always `strings.TrimSpace`.
- Don't mix a `bufio` reader with plain `fmt.Scan` on `os.Stdin`: the buffer already swallowed the input `fmt.Scan` wanted.
- `Scanner` silently stops on lines over 64 KB. Check `sc.Err()` or raise the limit with `sc.Buffer`.
