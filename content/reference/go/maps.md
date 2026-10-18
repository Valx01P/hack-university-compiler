# Maps

Go's built-in `map[K]V` is a hash map. Create it with a literal or `make` before you write to it, because writing to a nil map panics.

### Create

```go
ages := map[string]int{
	"alice": 30,
	"bob":   25,
}
counts := make(map[string]int) // empty, ready to write
var m map[string]int           // nil: reads work, writes panic
```

### Add, update, remove

```go
ages["carol"] = 41 // add or overwrite
ages["bob"]++      // 26
delete(ages, "alice")
delete(ages, "nobody") // missing key: no-op, no error
fmt.Println(len(ages)) // 2
```

### Read and check for a key

A missing key gives the zero value. Use the two-value form to tell "missing" from "stored zero".

```go
fmt.Println(ages["bob"]) // 26
fmt.Println(ages["zed"]) // 0 (zero value, no error)
age, ok := ages["zed"]   // 0 false

if v, ok := ages["bob"]; ok {
	fmt.Println("found", v) // found 26
}
```

### Loop in sorted order

`range` over a map visits keys in a random order on every run. Collect and sort the keys when order matters.

```go
import "sort"

keys := make([]string, 0, len(ages))
for k := range ages {
	keys = append(keys, k)
}
sort.Strings(keys)
for _, k := range keys {
	fmt.Println(k, ages[k])
}
// bob 26
// carol 41

fmt.Println(ages) // map[bob:26 carol:41] (Println sorts keys)
```

### Count and group

```go
import "strings"

words := strings.Fields("go is fun and go is fast")
freq := map[string]int{}
for _, w := range words {
	freq[w]++ // a missing key starts at 0
}
fmt.Println(freq) // map[and:1 fast:1 fun:1 go:2 is:2]

byLen := map[int][]string{}
for _, w := range words {
	byLen[len(w)] = append(byLen[len(w)], w) // appending to nil is fine
}
fmt.Println(byLen) // map[2:[go is go is] 3:[fun and] 4:[fast]]
```

### Nested maps and struct keys

```go
graph := map[string]map[string]int{}
if graph["a"] == nil {
	graph["a"] = map[string]int{} // make the inner map first
}
graph["a"]["b"] = 5
fmt.Println(graph) // map[a:map[b:5]]

type Point struct{ X, Y int }
grid := map[Point]string{{0, 0}: "origin"} // struct keys work
fmt.Println(grid[Point{0, 0}])             // origin
```

### Update a struct value

Map values are not addressable, so copy out, change, and store back (or store pointers).

```go
pts := map[string]Point{"p": {1, 2}}
// pts["p"].X = 9  // compile error: cannot assign
p := pts["p"]
p.X = 9
pts["p"] = p
fmt.Println(pts) // map[p:{9 2}]
```

### Copy and compare

```go
import "reflect"

clone := make(map[string]int, len(ages))
for k, v := range ages {
	clone[k] = v
}
fmt.Println(reflect.DeepEqual(ages, clone)) // true

other := ages // same map, not a copy
other["bob"] = 0
fmt.Println(ages["bob"]) // 0
```

| Call | Does |
| --- | --- |
| `m[k] = v` | add or overwrite |
| `v := m[k]` | get, zero value if missing |
| `v, ok := m[k]` | get and report whether the key exists |
| `delete(m, k)` | remove (safe if missing) |
| `len(m)` | number of entries |
| `for k, v := range m` | loop, random order |
| `reflect.DeepEqual(a, b)` | compare two maps (`==` only works against `nil`) |

### Gotchas

- `var m map[string]int` then `m["a"] = 1` panics with "assignment to entry in nil map". Use `make` or `{}`.
- Range order is random. Sort the keys before printing anything that must be stable.
- Maps are references: assigning or passing one to a function shares the same data.
- Go 1.16 has no `maps` package or generics, so copying, merging, and listing keys are hand-written loops.
