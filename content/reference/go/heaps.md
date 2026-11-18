# Heaps and Priority Queues

Go has no heap type. `container/heap` turns your own slice type into a binary min-heap once it has five methods: `Len`, `Less`, and `Swap` (the `sort.Interface`) plus `Push` and `Pop` with pointer receivers. `Less` decides the order, so `<` gives a min-heap and `>` a max-heap. Then you always go through the package: `heap.Init`, `heap.Push`, and `heap.Pop`.

### Min-heap of ints: the five methods, push, pop, peek, init

```go
import "container/heap"

type IntHeap []int

func (h IntHeap) Len() int            { return len(h) }
func (h IntHeap) Less(i, j int) bool  { return h[i] < h[j] }
func (h IntHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *IntHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *IntHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1] // heap.Pop already moved the top here
	*h = old[:len(old)-1]
	return x
}

h := &IntHeap{}
heap.Push(h, 5)
heap.Push(h, 1)
heap.Push(h, 3)
fmt.Println((*h)[0])           // 1, peek: the smallest sits at index 0
fmt.Println(heap.Pop(h).(int)) // 1, removed, asserted back to int
fmt.Println(h.Len())           // 2

nums := &IntHeap{5, 2, 8, 1, 9}
heap.Init(nums)    // build from existing data in O(n), in place
fmt.Println(*nums) // [1 2 8 5 9], heap order, not sorted
sorted := []int{}
for nums.Len() > 0 {
	sorted = append(sorted, heap.Pop(nums).(int))
}
fmt.Println(sorted) // [1 2 5 8 9], only popping comes out sorted
```

### Max-heap: flip Less

For ints you can also push `-x` into a min-heap and negate what you pop.

```go
type MaxHeap []int

func (h MaxHeap) Len() int            { return len(h) }
func (h MaxHeap) Less(i, j int) bool  { return h[i] > h[j] } // > puts the largest on top
func (h MaxHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *MaxHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *MaxHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

stones := &MaxHeap{2, 7, 4, 1, 8, 1}
heap.Init(stones) // the whole list at once
for stones.Len() > 1 {
	y := heap.Pop(stones).(int) // heaviest
	x := heap.Pop(stones).(int) // next heaviest
	if y != x {
		heap.Push(stones, y-x)
	}
}
last := 0
if stones.Len() == 1 {
	last = (*stones)[0]
}
fmt.Println(last) // 1
```

### A heap of pairs by a key, with a tie-break

The k closest points to the origin: by squared distance, then by x, then by y.

```go
type PointHeap [][2]int

func sq(p [2]int) int { return p[0]*p[0] + p[1]*p[1] }

func (h PointHeap) Len() int { return len(h) }
func (h PointHeap) Less(i, j int) bool {
	if di, dj := sq(h[i]), sq(h[j]); di != dj {
		return di < dj // closer first
	}
	if h[i][0] != h[j][0] {
		return h[i][0] < h[j][0] // then smaller x
	}
	return h[i][1] < h[j][1] // then smaller y
}
func (h PointHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *PointHeap) Push(x interface{}) { *h = append(*h, x.([2]int)) }
func (h *PointHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

h := &PointHeap{{3, 3}, {-2, 2}, {1, -3}, {2, -2}, {5, -1}}
heap.Init(h)
for i := 0; i < 3; i++ {
	fmt.Println(heap.Pop(h).([2]int)) // [-2 2], then [2 -2], then [1 -3]
}
```

### A heap of structs: top k frequent words

```go
type WordCount struct {
	Word  string
	Count int
}

type WordHeap []WordCount

func (h WordHeap) Len() int { return len(h) }
func (h WordHeap) Less(i, j int) bool {
	if h[i].Count != h[j].Count {
		return h[i].Count > h[j].Count // the most frequent on top
	}
	return h[i].Word < h[j].Word // ties: A to Z
}
func (h WordHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *WordHeap) Push(x interface{}) { *h = append(*h, x.(WordCount)) }
func (h *WordHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

counts := map[string]int{}
for _, w := range []string{"i", "love", "code", "i", "love", "go", "i"} {
	counts[w]++
}
h := WordHeap{}
for w, c := range counts {
	h = append(h, WordCount{w, c}) // the map's random order doesn't matter here
}
heap.Init(&h)
for k := 0; k < 3; k++ {
	wc := heap.Pop(&h).(WordCount)
	fmt.Println(wc.Word, wc.Count) // i 3, then love 2, then code 1
}
```

### Kth largest: a min-heap kept at size k

```go harness
type IntHeap []int

func (h IntHeap) Len() int            { return len(h) }
func (h IntHeap) Less(i, j int) bool  { return h[i] < h[j] }
func (h IntHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *IntHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *IntHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

{{code}}
```

```go
nums := []int{3, 2, 1, 5, 6, 4}
k := 2
h := &IntHeap{}
for _, x := range nums {
	heap.Push(h, x)
	if h.Len() > k {
		heap.Pop(h) // drop the smallest, keep the k largest
	}
}
fmt.Println((*h)[0]) // 5, the 2nd largest
```

### Two heaps: running median

`IntHeap` and `MaxHeap` are the types above.

```go harness
type IntHeap []int

func (h IntHeap) Len() int            { return len(h) }
func (h IntHeap) Less(i, j int) bool  { return h[i] < h[j] }
func (h IntHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *IntHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *IntHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

type MaxHeap []int

func (h MaxHeap) Len() int            { return len(h) }
func (h MaxHeap) Less(i, j int) bool  { return h[i] > h[j] }
func (h MaxHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *MaxHeap) Push(x interface{}) { *h = append(*h, x.(int)) }
func (h *MaxHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

{{code}}
```

```go
low := &MaxHeap{}  // the smaller half, its largest on top
high := &IntHeap{} // the larger half, its smallest on top
for _, x := range []int{5, 15, 1, 3} {
	heap.Push(low, x)
	heap.Push(high, heap.Pop(low)) // the largest of the low half moves up
	if high.Len() > low.Len() {
		heap.Push(low, heap.Pop(high)) // low keeps the extra one
	}
	median := float64((*low)[0])
	if low.Len() == high.Len() {
		median = float64((*low)[0]+(*high)[0]) / 2
	}
	fmt.Printf("%.1f\n", median) // 5.0, then 10.0, then 5.0, then 4.0
}
```

### Merge k sorted lists

Merging k sorted linked lists uses a heap of `*ListNode` ordered by `Val`. The full template is in Linked Lists.

### Costs

| Call | Cost |
| --- | --- |
| `heap.Push(h, x)`, `heap.Pop(h)` | O(log n) |
| `(*h)[0]`, `h.Len()` | O(1) |
| `heap.Init(h)` | O(n) |
| `heap.Fix(h, i)` after you change element `i`, `heap.Remove(h, i)` | O(log n) |

### Gotchas

- Call `heap.Push(h, x)` and `heap.Pop(h)`, never `h.Push(x)` or `h.Pop()`. Your methods only append and cut the end, so calling them directly breaks the heap with no error.
- `Push` and `Pop` need pointer receivers, and you pass a pointer: `heap.Init(&h)`. Then peek with `(*h)[0]` when `h` is a pointer, after checking `h.Len() > 0`, since `heap.Pop` on an empty heap panics.
- Printing a heap shows heap order, not sorted order. Only popping in a loop comes out sorted.
- Go 1.16 has no generics, so every element type needs its own type with the five methods, and values come back as `interface{}`. Assert them: `heap.Pop(h).(int)`.
