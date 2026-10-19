# Interfaces and Embedding

Go does OOP without inheritance. Interfaces give you polymorphism and are satisfied implicitly (no `implements`), and embedding one struct in another gives you reuse.

### Interfaces and polymorphism

Any type with the right methods satisfies the interface automatically.

```go
import "math"

type Shape interface {
	Area() float64
	Name() string
}

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64   { return r.W * r.H }
func (r Rect) Name() string    { return "rect" }
func (c Circle) Area() float64 { return math.Pi * c.R * c.R }
func (c Circle) Name() string  { return "circle" }

shapes := []Shape{Rect{2, 3}, Circle{1}}
for _, s := range shapes {
	fmt.Printf("%s %.2f\n", s.Name(), s.Area())
}
// rect 6.00
// circle 3.14
```

### Embedding instead of inheritance

Fields and methods of the embedded type are promoted. Defining the same method on the outer type overrides it.

```go
type Animal struct {
	Name string
}

func (a Animal) Describe() string { return a.Name + " is an animal" }
func (a Animal) Sound() string    { return "..." }

type Dog struct {
	Animal // embedded: Dog gets Name, Describe, and Sound
	Breed  string
}

func (d Dog) Sound() string { return "Woof" } // overrides Animal.Sound

d := Dog{Animal: Animal{Name: "Rex"}, Breed: "lab"}
fmt.Println(d.Name)           // Rex (promoted field)
fmt.Println(d.Describe())     // Rex is an animal (promoted method)
fmt.Println(d.Sound())        // Woof
fmt.Println(d.Animal.Sound()) // ... ("super" call)
```

### Type assertion and type switch

```go harness
package main

import (
	"fmt"
	"math"
)

type Shape interface {
	Area() float64
	Name() string
}

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64   { return r.W * r.H }
func (r Rect) Name() string    { return "rect" }
func (c Circle) Area() float64 { return math.Pi * c.R * c.R }
func (c Circle) Name() string  { return "circle" }

func main() {

	{{code}}
}
```

```go
var s Shape = Circle{2}
c, ok := s.(Circle)  // ok is false if s holds something else
fmt.Println(c.R, ok) // 2 true

var v interface{} = Rect{1, 2}
switch x := v.(type) {
case Shape: // a case can name an interface
	fmt.Println("shape", x.Name()) // shape rect
default:
	fmt.Println("not a shape")
}
```

The full type switch syntax is in Switch.

### Pointer receivers and interfaces

If the methods use a `*T` receiver, only `*T` satisfies the interface.

```go
type Counter struct{ n int }

func (c *Counter) Inc() { c.n++ }

type Incer interface{ Inc() }

var i Incer = &Counter{} // Counter{} would not compile
i.Inc()
fmt.Println(i) // &{1}
```

### Depend on an interface

```go
type Logger interface{ Log(msg string) }

type ConsoleLogger struct{ prefix string }

func (c ConsoleLogger) Log(msg string) { fmt.Println(c.prefix + msg) }

type Service struct {
	log Logger // any Logger works, easy to swap in tests
}

func (s Service) Run() { s.log.Log("running") }

svc := Service{log: ConsoleLogger{prefix: "[app] "}}
svc.Run() // [app] running
```

### Implement a standard interface

`sort.Interface` is three methods. `fmt.Stringer` (`String() string`) and `error` (`Error() string`) are the other common ones.

```go harness
type Shape interface {
	Area() float64
	Name() string
}

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64   { return r.W * r.H }
func (r Rect) Name() string    { return "rect" }
func (c Circle) Area() float64 { return math.Pi * c.R * c.R }
func (c Circle) Name() string  { return "circle" }

{{code}}
```

```go
import "sort"

type ByArea []Shape

func (b ByArea) Len() int           { return len(b) }
func (b ByArea) Less(i, j int) bool { return b[i].Area() < b[j].Area() }
func (b ByArea) Swap(i, j int)      { b[i], b[j] = b[j], b[i] }

list := []Shape{Rect{3, 3}, Circle{1}, Rect{1, 2}}
sort.Sort(ByArea(list))
fmt.Println(list) // [{1 2} {1} {3 3}]
```

### Combine interfaces, check at compile time

```go harness
package main

import (
	"fmt"
	"math"
)

type Shape interface {
	Area() float64
	Name() string
}

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64   { return r.W * r.H }
func (r Rect) Name() string    { return "rect" }
func (c Circle) Area() float64 { return math.Pi * c.R * c.R }
func (c Circle) Name() string  { return "circle" }

func main() {

	{{code}}
	fmt.Println("Rect satisfies Shape")
}
```

```go
type Reader interface{ Read() string }
type Writer interface{ Write(s string) }
type ReadWriter interface {
	Reader
	Writer
}

var _ Shape = Rect{} // compile error if Rect stops satisfying Shape
```

| Syntax | Does |
| --- | --- |
| `type I interface{ M() }` | declare an interface |
| `var x I = T{}` | store any type that has the methods |
| `v, ok := x.(T)` | get the concrete type back safely |
| `switch v := x.(type)` | branch on the concrete type |
| `interface{}` | any value (no `any` alias in Go 1.16) |
| `struct{ Base; ... }` | embed a type and promote its members |

### Gotchas

- Embedding is not inheritance. If `Animal.Describe` calls `a.Sound()`, it runs `Animal.Sound` even on a `Dog`, there is no virtual dispatch.
- `x.(T)` only works when `x` is an interface. On a concrete type it fails with `non-interface type on left`.
- `x.(T)` without `, ok` panics when `x` holds another type.
- No generics in Go 1.16, so containers of mixed things use `interface{}` plus assertions.
