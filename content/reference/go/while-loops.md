# While Loops

Go has no `while` keyword. A `for` with only a condition is the while loop, and a bare `for` is the infinite loop. There is no `do while` either.

### While

```go
n := 1
for n < 100 {
	n *= 2
}
fmt.Println(n) // 128
```

### Countdown

```go
count := 3
for count > 0 {
	fmt.Print(count, " ")
	count--
}
fmt.Println("go!")
// 3 2 1 go!
```

### Infinite loop with break

```go
i := 0
for {
	i++
	if i == 5 {
		break
	}
}
fmt.Println(i) // 5
```

### Do while

Run the body once, then check at the bottom.

```go
x := 10
for {
	fmt.Println("runs once:", x)
	x++
	if x >= 5 {
		break
	}
}
// runs once: 10
```

### Classic while patterns

Digits of a number:

```go
n := 4096
sum := 0
for n > 0 {
	sum += n % 10
	n /= 10
}
fmt.Println(sum) // 19
```

Halving with a step counter (Collatz):

```go
n, steps := 6, 0
for n != 1 {
	if n%2 == 0 {
		n /= 2
	} else {
		n = 3*n + 1
	}
	steps++
}
fmt.Println(steps) // 8
```

Two pointers moving toward each other:

```go
s := []int{1, 2, 3, 4, 5}
lo, hi := 0, len(s)-1
for lo < hi {
	s[lo], s[hi] = s[hi], s[lo]
	lo++
	hi--
}
fmt.Println(s) // [5 4 3 2 1]
```

### Read input until it runs out

```go
import (
	"bufio"
	"os"
)

sc := bufio.NewScanner(os.Stdin)
for sc.Scan() {
	line := sc.Text()
	fmt.Println("got:", line)
}
```

More ways to read input are in Reading Input.

### Forms

| Form | Means |
| --- | --- |
| `for cond { }` | while `cond` is true |
| `for { }` | forever, leave with `break` or `return` |
| `break` | leave the loop now |
| `continue` | skip to the next check of `cond` |

### Gotchas

- `while (x < 5)` does not compile. Write `for x < 5 {`, without parentheses.
- With `continue` in a while loop, make sure the update still runs, or the loop never ends.
- A `break` inside a `switch` or `select` leaves only that statement, not the loop. Use a label to leave the loop.
