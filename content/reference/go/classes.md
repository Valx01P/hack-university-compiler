# Structs and Methods

Go has no classes. A `struct` holds the data, methods attach to the type through a receiver, and a `NewX` function plays the constructor. Capitalized names are exported (public), lowercase ones are private to the package.

### Define and create

```go
type Person struct {
	Name string
	Age  int
}

p := Person{Name: "Ann", Age: 30}
q := Person{"Bob", 25}        // positional: every field, in order
var z Person                  // zero value: {"" 0}
ptr := &Person{Name: "Cy"}    // pointer to a new struct
fmt.Println(p.Name, ptr.Name) // Ann Cy (no -> needed)
fmt.Printf("%+v\n", p)        // {Name:Ann Age:30}
```

### Methods

A value receiver gets a copy. A pointer receiver can change the struct.

```go harness
type Person struct {
	Name string
	Age  int
}

p := Person{Name: "Ann", Age: 30}
{{code}}
```

```go
func (p Person) Greet() string {
	return "Hi, " + p.Name
}

func (p *Person) Birthday() {
	p.Age++
}

fmt.Println(p.Greet()) // Hi, Ann
p.Birthday()           // Go passes &p for you
fmt.Println(p.Age)     // 31
```

### Constructor and private fields

```go
import "errors"

type Account struct {
	owner   string // lowercase: hidden outside the package
	balance float64
}

func NewAccount(owner string) *Account {
	return &Account{owner: owner}
}

func (a *Account) Deposit(amt float64) {
	a.balance += amt
}

func (a *Account) Withdraw(amt float64) error {
	if amt > a.balance {
		return errors.New("insufficient funds")
	}
	a.balance -= amt
	return nil
}

func (a *Account) Balance() float64 { return a.balance }

acct := NewAccount("ann")
acct.Deposit(50)
if err := acct.Withdraw(80); err != nil {
	fmt.Println(err) // insufficient funds
}
fmt.Println(acct.Balance()) // 50
```

### toString: the String method

```go harness
type Person struct {
	Name string
	Age  int
}

p := Person{Name: "Ann", Age: 31}
{{code}}
```

```go
func (p Person) String() string {
	return fmt.Sprintf("%s (%d)", p.Name, p.Age)
}

fmt.Println(p) // Ann (31), Println and %v now use it
```

### A slice of objects in a loop

```go harness
type Person struct {
	Name string
	Age  int
}

{{code}}
```

```go
import "sort"

people := []Person{{"Ann", 30}, {"Bob", 25}, {"Cy", 35}}
for i := range people {
	people[i].Age++ // index it: the range value is a copy
}
sort.Slice(people, func(i, j int) bool {
	return people[i].Age < people[j].Age
})
for _, p := range people {
	fmt.Println(p.Name, p.Age)
}
// Bob 26
// Ann 31
// Cy 36
```

### A small data structure

```go
type Stack struct {
	items []int
}

func (s *Stack) Push(v int) { s.items = append(s.items, v) }

func (s *Stack) Pop() int {
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v
}

var s Stack // the zero value is ready to use
s.Push(1)
s.Push(2)
fmt.Println(s.Pop()) // 2
```

### Copies, pointers, equality

```go harness
package main

import "fmt"

type Person struct {
	Name string
	Age  int
}

func main() {

	{{code}}
}
```

```go
a := Person{"Ann", 30}
b := a // copies every field
b.Name = "Bea"
fmt.Println(a.Name, a == Person{"Ann", 30}) // Ann true

pa := &a
pb := pa // copies the pointer, same struct
pb.Name = "Ada"
fmt.Println(a.Name) // Ada
```

### Static members

There is no `static`. Use package-level constants, variables, and functions.

```go
const MaxUsers = 100 // like a static constant

var userCount int // like a static field
```

| Syntax | Does |
| --- | --- |
| `T{Field: v}` | create a value |
| `&T{...}` or `new(T)` | create a pointer |
| `func (t T) M()` | method on a copy |
| `func (t *T) M()` | method that can modify |
| `func (t T) String() string` | custom print text |
| `fmt.Printf("%+v", t)` | print with field names |
| `fmt.Printf("%T", t)` | print the type: `main.Person` |

### Gotchas

- `for _, p := range people { p.Age++ }` changes a copy. Use `people[i].Age++`.
- A method with a value receiver can't change the original. Use `*T` when the method mutates.
- Calling a method that reads fields on a nil `*T` panics with "nil pointer dereference".
- `==` fails to compile on structs that contain slices, maps, or funcs.
