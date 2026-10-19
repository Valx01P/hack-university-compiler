# Sets

Go has no set type. Use a map with the items as keys: `map[T]bool` reads cleanly, `map[T]struct{}` stores nothing per key.

### Create, add, check, remove

```go
seen := map[string]bool{}
seen["go"] = true
seen["py"] = true
seen["go"] = true      // already there, nothing changes
fmt.Println(len(seen)) // 2

if seen["go"] { // a missing key reads as false
	fmt.Println("has go")
}
fmt.Println(seen["js"]) // false
delete(seen, "py")
fmt.Println(seen) // map[go:true]
```

### The struct{} version

```go
set := make(map[int]struct{})
set[3] = struct{}{}
_, ok := set[3]
fmt.Println(ok) // true
for n := range set {
	fmt.Println(n) // 3
}
```

### Remove duplicates, keep order

```go
nums := []int{3, 1, 3, 2, 1}
have := map[int]bool{}
uniq := []int{}
for _, n := range nums {
	if !have[n] {
		have[n] = true
		uniq = append(uniq, n)
	}
}
fmt.Println(uniq) // [3 1 2]
```

### Sorted list from a set

```go
import "sort"

ws := map[string]bool{"b": true, "a": true, "c": true}
list := make([]string, 0, len(ws))
for w := range ws {
	list = append(list, w)
}
sort.Strings(list)
fmt.Println(list) // [a b c]
```

### Union, intersection, difference

```go
a := map[string]bool{"x": true, "y": true}
b := map[string]bool{"y": true, "z": true}

union := map[string]bool{}
for k := range a {
	union[k] = true
}
for k := range b {
	union[k] = true
}

inter := map[string]bool{}
diff := map[string]bool{} // in a, not in b
for k := range a {
	if b[k] {
		inter[k] = true
	} else {
		diff[k] = true
	}
}
fmt.Println(union) // map[x:true y:true z:true]
fmt.Println(inter) // map[y:true]
fmt.Println(diff)  // map[x:true]
```

### Sets of pairs (grid cells, visited states)

Keys must be comparable: structs and arrays work, slices do not.

```go
type cell struct{ r, c int }
visited := map[cell]bool{}
visited[cell{0, 1}] = true
fmt.Println(visited[cell{0, 1}], visited[cell{1, 0}]) // true false

seen2 := map[[2]int]bool{{0, 1}: true} // array key
fmt.Println(seen2[[2]int{0, 1}])       // true
```

| Set idea | Go spelling |
| --- | --- |
| new set | `s := map[T]bool{}` |
| add | `s[x] = true` |
| contains | `s[x]` (or `_, ok := s[x]` for `struct{}`) |
| remove | `delete(s, x)` |
| size | `len(s)` |
| loop | `for x := range s` (random order) |

### Gotchas

- `s[x] = false` still adds the key, so `len(s)` counts it. Use `delete` to remove.
- Iteration order is random. Collect into a slice and `sort` it before printing.
- `[]int` cannot be a key. Use a fixed array `[2]int`, a struct, or a string such as `fmt.Sprint(slice)`.
