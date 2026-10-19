# Standard Library

Go ships a large standard library and no third-party packages run here. Import each package by its path (`"math/rand"`, `"container/heap"`) and call it by its last part (`rand.Intn`, `heap.Push`).

| Need | Package | Common calls |
| --- | --- | --- |
| text | `strings` | `Split`, `Join`, `Fields`, `Contains`, `Replace`, `TrimSpace`, `Builder` |
| text and numbers | `strconv` | `Atoi`, `Itoa`, `ParseFloat`, `FormatInt` |
| sorting | `sort` | `Ints`, `Strings`, `Slice`, `SearchInts` |
| math | `math` | `Sqrt`, `Pow`, `Abs`, `Floor`, `MaxInt64`, `Inf` |
| characters | `unicode` | `IsLetter`, `IsDigit`, `IsSpace`, `ToUpper` |
| random | `math/rand` | `Seed`, `Intn`, `Float64`, `Shuffle` |
| dates and timing | `time` | `Now`, `Since`, `Sleep`, `Date`, `Format` |
| priority queue | `container/heap` | `Init`, `Push`, `Pop` |
| deque | `container/list` | `PushBack`, `PushFront`, `Front`, `Remove` |
| JSON | `encoding/json` | `Marshal`, `Unmarshal`, `MarshalIndent` |
| program and files | `os` | `Args`, `Exit`, `ReadFile`, `Stdin` |
| fast input | `bufio` | `NewScanner`, `NewReader` |

`strings` and `unicode` are covered in Strings, `strconv` in Variables and Types, `sort` in Slices and Arrays, `math` in Built-ins and the math Package, and `bufio` in Reading Input. The rest are below.

### math/rand

```go
import (
	"math/rand"
	"time"
)

rand.Seed(time.Now().UnixNano()) // without this, every run gives the same numbers
d := rand.Intn(6) + 1            // 1..6
f := rand.Float64()              // 0.0 up to (not including) 1.0
deck := []int{1, 2, 3, 4}
rand.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
```

### time

```go
import "time"

start := time.Now()
time.Sleep(50 * time.Millisecond)
fmt.Println(time.Since(start).Milliseconds() >= 50) // true

t := time.Date(2024, time.March, 5, 14, 30, 0, 0, time.UTC)
fmt.Println(t.Format("2006-01-02 15:04"))     // 2024-03-05 14:30
fmt.Println(t.Weekday(), t.AddDate(0, 0, 30)) // Tuesday 2024-04-04 14:30:00 +0000 UTC
fmt.Println(90 * time.Minute)                 // 1h30m0s
```

### container/heap: priority queue

Implement five methods on a slice type, then use the `heap` functions.

```go
import "container/heap"

type IntHeap []int

func (h IntHeap) Len() int            { return len(h) }
func (h IntHeap) Less(i, j int) bool  { return h[i] < h[j] } // > for a max-heap
func (h IntHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *IntHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *IntHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

h := &IntHeap{5, 2, 8}
heap.Init(h)
heap.Push(h, 1)
for h.Len() > 0 {
	fmt.Print(heap.Pop(h), " ")
}
fmt.Println() // 1 2 5 8
```

### Queues: slice or container/list

```go
queue := []int{1, 2, 3}
queue = append(queue, 4) // enqueue
first := queue[0]        // dequeue
queue = queue[1:]
fmt.Println(first, queue) // 1 [2 3 4]
```

```go
import "container/list"

dq := list.New()
dq.PushBack(1)
dq.PushFront(0)
e := dq.Front()
dq.Remove(e)
fmt.Println(e.Value.(int), dq.Len()) // 0 1
```

### encoding/json

Only exported (capitalized) fields are encoded. Tags rename them.

```go
import "encoding/json"

type User struct {
	Name string   `json:"name"`
	Age  int      `json:"age"`
	Tags []string `json:"tags,omitempty"`
}

data, _ := json.Marshal(User{Name: "Ann", Age: 30})
fmt.Println(string(data)) // {"name":"Ann","age":30}

var u User
err := json.Unmarshal([]byte(`{"name":"Bob","age":25}`), &u)
fmt.Printf("%+v %v\n", u, err) // {Name:Bob Age:25 Tags:[]} <nil>
```

### os

```go error
import "os"

fmt.Println(len(os.Args))             // program name plus command-line arguments
data, err := os.ReadFile("notes.txt") // Go 1.16+, err if missing
os.Exit(1)                            // quit now with a status code, defers do not run
```

### Gotchas

- `math/rand` is not seeded in Go 1.16. Call `rand.Seed` once or you get the same "random" numbers every run.
- `time.Format` uses the reference date `2006-01-02 15:04:05`, not `YYYY-MM-DD`.
- `heap.Pop(h)` returns `interface{}`. Assert it back with `heap.Pop(h).(int)` before doing math on it.
- No `slices`, `maps`, or `cmp` packages in Go 1.16. Those came with generics in 1.18 and later.
