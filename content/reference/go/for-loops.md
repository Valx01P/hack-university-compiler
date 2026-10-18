# For Loops

Go has exactly one loop keyword, `for`. It does counting loops, while loops, infinite loops, and `range` loops. No parentheses around the header, and the braces are required.

### Count up

```go
for i := 0; i < 5; i++ {
	fmt.Print(i, " ")
}
// 0 1 2 3 4
```

### Count down, step by more than one

```go
for i := 10; i > 0; i -= 3 {
	fmt.Print(i, " ")
}
// 10 7 4 1

for i := 0; i <= 20; i += 5 {
	fmt.Print(i, " ")
}
// 0 5 10 15 20
```

### Two variables at once

Use parallel assignment in the init and post parts. There is no comma operator.

```go
for i, j := 0, 4; i < j; i, j = i+1, j-1 {
	fmt.Println(i, j)
}
// 0 4
// 1 3
```

### Range

`range` walks a slice, array, string, map, or channel. You get the index (or key) and a copy of the value.

```go
nums := []int{10, 20, 30}
for i, v := range nums {
	fmt.Println(i, v)
}
// 0 10
// 1 20
// 2 30

for _, v := range nums { // value only
	fmt.Print(v, " ")
}
// 10 20 30

for i := range nums { // index only
	nums[i] *= 2
}
fmt.Println(nums) // [20 40 60]
```

Run once per element without naming any variable:

```go
for range nums {
	fmt.Print("hi ")
}
// hi hi hi
```

### Break and continue

```go
for i := 0; i < 10; i++ {
	if i%2 == 0 {
		continue // skip evens
	}
	if i > 7 {
		break // leave the loop
	}
	fmt.Print(i, " ")
}
// 1 3 5 7
```

### Nested loops and labels

A plain `break` only leaves the innermost loop. Put a label on the outer loop to break out of both.

```go
outer:
for i := 0; i < 3; i++ {
	for j := 0; j < 3; j++ {
		if i*j == 2 {
			break outer
		}
		fmt.Printf("%d%d ", i, j)
	}
}
// 00 01 02 10 11
```

`continue outer` works the same way and jumps to the next pass of the outer loop.

### Loop parts at a glance

| Form | Means |
| --- | --- |
| `for init; cond; post { }` | classic counting loop |
| `for cond { }` | while loop |
| `for { }` | forever, until `break` or `return` |
| `for i, v := range s { }` | index and value |
| `for _, v := range s { }` | value only |
| `for i := range s { }` | index only |
| `for range s { }` | len(s) times, no variables |

### Gotchas

- `for i := range 10` does not exist in Go 1.16 (it came in 1.22). Write `for i := 0; i < 10; i++`.
- `i++` is a statement, not an expression. `x = i++` and `++i` do not compile.
- In Go 1.16 the loop variable is one variable reused every pass. A closure or goroutine that captures `i` sees its final value. Copy it first with `i := i` inside the body.
- The range value `v` is a copy. Assigning to `v` does not change the slice, so write `nums[i]` instead.
