# Multiple Returns and Pairs

Go has no tuple type. Functions return several values at once (see Functions), and to store a pair you use a small struct or a fixed-size array.

### Pass multiple results straight through

A call that returns several values can be the only argument of another call that takes them.

```go
func divmod(a, b int) (int, int) {
	return a / b, a % b
}

func show(q, r int) {
	fmt.Println(q, "remainder", r)
}

show(divmod(17, 5))        // 3 remainder 2
fmt.Println(divmod(17, 5)) // 3 2
```

Unpacking with `q, r := divmod(17, 5)`, `_`, and the `v, ok` forms are in Multiple Assignment.

### A pair as a struct

```go
import "sort"

type Pair struct {
	Name  string
	Score int
}

pairs := []Pair{{"bo", 70}, {"al", 90}, {"cy", 80}}
sort.Slice(pairs, func(i, j int) bool {
	return pairs[i].Score > pairs[j].Score
})
fmt.Println(pairs)         // [{al 90} {cy 80} {bo 70}]
fmt.Println(pairs[0].Name) // al
```

A one-off anonymous struct skips the type name:

```go
pt := struct{ X, Y int }{3, 4}
fmt.Println(pt.X, pt) // 3 {3 4}
```

### A pair as a fixed array

`[2]int` is handy for coordinates. Arrays compare with `==` and work as map keys.

```go
pos := [2]int{2, 2}
dirs := [][2]int{{0, 1}, {1, 0}, {0, -1}, {-1, 0}}
for _, d := range dirs {
	r, c := pos[0]+d[0], pos[1]+d[1]
	fmt.Print(r, ",", c, " ")
}
fmt.Println()
// 2,3 3,2 2,1 1,2

dist := map[[2]int]int{{0, 0}: 0}
dist[[2]int{0, 1}] = 1
fmt.Println(dist) // map[[0 0]:0 [0 1]:1]
```

### Map entries as sortable pairs

```go
import "sort"

type kv struct {
	Key string
	Val int
}

counts := map[string]int{"a": 3, "b": 1, "c": 2}
var kvs []kv
for k, v := range counts {
	kvs = append(kvs, kv{k, v})
}
sort.Slice(kvs, func(i, j int) bool { return kvs[i].Val > kvs[j].Val })
fmt.Println(kvs) // [{a 3} {c 2} {b 1}]
```

| Want | Go spelling |
| --- | --- |
| return two things | `func f() (int, error)` |
| ignore one | `_, err := f()` |
| pass both on | `g(f())` |
| typed pair | `type Pair struct{ A, B int }` |
| quick pair | `[2]int{1, 2}` |
| mixed types | `[]interface{}{"ann", 30}` (needs `.(string)` to read back) |

### Gotchas

- A multi-value call can't sit inside an expression: `x := divmod(7, 2)` fails with `assignment mismatch`. Assign both values.
- There is no `a, b := slice` unpacking. Index each one: `x, y := s[0], s[1]`.
- Slices are not comparable and can't be map keys. Use `[2]int` or a struct.
- Go 1.16 has no generics, so there is no reusable `Pair[A, B]`. Write a struct for the types you need.
