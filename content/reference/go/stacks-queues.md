# Stacks and Queues

Go has no stack or queue type. A slice is a stack: `append` pushes, `s[len(s)-1]` peeks, and `s = s[:len(s)-1]` pops. A queue is a slice you read from the front, with a head index or by reslicing. When you need to push and pop at both ends, `container/list` is a doubly linked list that works as a deque.

### Stack: a slice

```go
stack := []int{}
stack = append(stack, 1) // push
stack = append(stack, 2)
stack = append(stack, 3)
fmt.Println(stack[len(stack)-1]) // 3, peek

top := stack[len(stack)-1] // pop: read the last one, then cut it off
stack = stack[:len(stack)-1]
fmt.Println(top, stack)      // 3 [1 2]
fmt.Println(len(stack) == 0) // false, the empty check
```

### Queue: a slice and a head index

```go
queue := []string{"a", "b", "c"}
head := 0
for head < len(queue) {
	x := queue[head] // dequeue
	head++
	fmt.Print(x, " ")
	if x == "a" {
		queue = append(queue, "d") // enqueue at the back
	}
}
fmt.Println() // a b c d

q := []int{1, 2, 3}
front := q[0] // or dequeue by reslicing, also O(1)
q = q[1:]
fmt.Println(front, q, len(q)) // 1 [2 3] 2
```

### Deque: container/list

```go
import "container/list"

dq := list.New()
dq.PushBack(2)
dq.PushBack(3)
dq.PushFront(1)
fmt.Println(dq.Front().Value, dq.Back().Value, dq.Len()) // 1 3 3

last := dq.Remove(dq.Back()).(int)   // pop back: Remove returns the value
first := dq.Remove(dq.Front()).(int) // pop front, asserted back to int
fmt.Println(first, last, dq.Len())   // 1 3 1
for e := dq.Front(); e != nil; e = e.Next() {
	fmt.Println(e.Value) // 2
}
```

### Calls

| Operation | Slice | `container/list` |
| --- | --- | --- |
| push back | `s = append(s, x)`, O(1) on average | `l.PushBack(x)`, O(1) |
| pop back | `s = s[:len(s)-1]`, O(1) | `l.Remove(l.Back())`, O(1) |
| pop front | `s = s[1:]` or `head++`, O(1) | `l.Remove(l.Front())`, O(1) |
| push front | `s = append([]int{x}, s...)`, O(n) | `l.PushFront(x)`, O(1) |
| peek | `s[len(s)-1]`, `s[0]` | `l.Back().Value`, `l.Front().Value` |
| size | `len(s)` | `l.Len()` |

### Valid parentheses

```go
func isValid(s string) bool {
	pairs := map[rune]rune{')': '(', ']': '[', '}': '{'}
	stack := []rune{}
	for _, ch := range s {
		open, isClose := pairs[ch]
		if !isClose {
			stack = append(stack, ch) // an opener: wait for its match
			continue
		}
		if len(stack) == 0 || stack[len(stack)-1] != open {
			return false
		}
		stack = stack[:len(stack)-1]
	}
	return len(stack) == 0 // nothing left open
}

fmt.Println(isValid("([]{})"), isValid("(]"), isValid("((")) // true false false
```

### Min stack: a second stack of minimums

```go
type MinStack struct {
	vals, mins []int // mins[i] is the smallest of vals[:i+1]
}

func (s *MinStack) Push(x int) {
	m := x
	if len(s.mins) > 0 && s.mins[len(s.mins)-1] < m {
		m = s.mins[len(s.mins)-1]
	}
	s.vals = append(s.vals, x)
	s.mins = append(s.mins, m)
}

func (s *MinStack) Pop() {
	s.vals = s.vals[:len(s.vals)-1]
	s.mins = s.mins[:len(s.mins)-1]
}

func (s *MinStack) Top() int    { return s.vals[len(s.vals)-1] }
func (s *MinStack) GetMin() int { return s.mins[len(s.mins)-1] }

ms := &MinStack{}
ms.Push(5)
ms.Push(2)
ms.Push(7)
fmt.Println(ms.Top(), ms.GetMin()) // 7 2
ms.Pop()
ms.Pop()
fmt.Println(ms.Top(), ms.GetMin()) // 5 5
```

### Monotonic stack: days until warmer

The stack holds indexes of days still waiting, their temperatures falling from bottom to top. A warmer day pops every cooler one and answers it.

```go
temps := []int{73, 74, 75, 71, 69, 72, 76, 73}
wait := make([]int, len(temps))
stack := []int{}
for i, t := range temps {
	for len(stack) > 0 && temps[stack[len(stack)-1]] < t {
		j := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		wait[j] = i - j
	}
	stack = append(stack, i)
}
fmt.Println(wait) // [1 1 4 2 1 1 0 0]
```

### Monotonic deque: sliding window maximum

Keep indexes whose values fall from front to back. The front is the window's maximum.

```go
nums := []int{1, 3, -1, -3, 5, 3, 6, 7}
k := 3
window := []int{}
maxes := []int{}
for i, x := range nums {
	for len(window) > 0 && nums[window[len(window)-1]] <= x {
		window = window[:len(window)-1] // smaller ones can never be the max again
	}
	window = append(window, i)
	if window[0] <= i-k {
		window = window[1:] // the front slid out of the window
	}
	if i >= k-1 {
		maxes = append(maxes, nums[window[0]])
	}
}
fmt.Println(maxes) // [3 3 5 5 6 7]
```

### Simulate with a stack

```go
import "strconv"

ops := []string{"5", "2", "C", "D", "+"}
scores := []int{}
for _, op := range ops {
	n := len(scores)
	switch op {
	case "+":
		scores = append(scores, scores[n-1]+scores[n-2])
	case "D":
		scores = append(scores, 2*scores[n-1])
	case "C":
		scores = scores[:n-1]
	default:
		v, _ := strconv.Atoi(op)
		scores = append(scores, v)
	}
}
fmt.Println(scores) // [5 10 15]
```

### Circular queue: a fixed slice, a head, and a size

```go
type CircularQueue struct {
	data       []int
	head, size int
}

func (q *CircularQueue) Enqueue(x int) bool {
	if q.size == len(q.data) {
		return false // full
	}
	q.data[(q.head+q.size)%len(q.data)] = x // wraps past the end
	q.size++
	return true
}

func (q *CircularQueue) Dequeue() bool {
	if q.size == 0 {
		return false
	}
	q.head = (q.head + 1) % len(q.data)
	q.size--
	return true
}

func (q *CircularQueue) Front() int {
	if q.size == 0 {
		return -1 // empty
	}
	return q.data[q.head]
}

func (q *CircularQueue) Rear() int {
	if q.size == 0 {
		return -1 // empty, and head-1 would be a negative index
	}
	return q.data[(q.head+q.size-1)%len(q.data)]
}

cq := &CircularQueue{data: make([]int, 3)}
fmt.Println(cq.Enqueue(1), cq.Enqueue(2), cq.Enqueue(3), cq.Enqueue(4)) // true true true false
cq.Dequeue()
cq.Enqueue(4)                                              // wraps to slot 0
fmt.Println(cq.Front(), cq.Rear())                         // 2 4
fmt.Println((&CircularQueue{data: make([]int, 2)}).Rear()) // -1
```

### Gotchas

- `s[len(s)-1]` on an empty slice panics with index out of range [-1]. Check `len(s) > 0` first.
- `for _, x := range queue` reads the slice once, so items you append inside the loop are never visited. Loop with `for len(queue) > 0` or a head index.
- `container/list` stores `interface{}` (no generics in Go 1.16). Assert when you read: `e.Value.(int)`.
- Pushing to the front of a slice copies every element. When both ends move, use `container/list` or the monotonic deque's trick of only cutting the front.
