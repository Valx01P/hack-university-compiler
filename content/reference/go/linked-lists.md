# Linked Lists

Interview problems hand you a `ListNode` and expect you to relink it by hand. In Go that is a struct with a pointer to the next node, and a `nil` pointer ends the list. `container/list` is a ready-made doubly linked list, but it hides its nodes, so here you write your own.

### The node (LeetCode shape), build, print, reverse

```go
type ListNode struct {
	Val  int
	Next *ListNode
}

func build(vals ...int) *ListNode {
	dummy := &ListNode{} // a fake first node, so the first value needs no special case
	tail := dummy
	for _, v := range vals {
		tail.Next = &ListNode{Val: v}
		tail = tail.Next
	}
	return dummy.Next
}

func toSlice(head *ListNode) []int {
	out := []int{}
	for n := head; n != nil; n = n.Next {
		out = append(out, n.Val)
	}
	return out
}

func reverse(head *ListNode) *ListNode {
	var prev *ListNode
	cur := head
	for cur != nil {
		next := cur.Next // save the rest first
		cur.Next = prev  // flip the link
		prev = cur
		cur = next
	}
	return prev // the old tail is the new head
}

head := build(4, 8, 15)
fmt.Println(toSlice(head), len(toSlice(head))) // [4 8 15] 3
head = &ListNode{Val: 1, Next: head}           // prepend in O(1)
fmt.Println(toSlice(reverse(head)))            // [15 8 4 1]
```

### Dummy head: delete matches, remove the nth from the end

```go harness
type ListNode struct {
	Val  int
	Next *ListNode
}

func build(vals ...int) (head *ListNode) {
	for i := len(vals) - 1; i >= 0; i-- {
		head = &ListNode{vals[i], head}
	}
	return
}

func toSlice(n *ListNode) (out []int) {
	for ; n != nil; n = n.Next {
		out = append(out, n.Val)
	}
	return
}
{{code}}
```

```go
func removeAll(head *ListNode, val int) *ListNode {
	dummy := &ListNode{Next: head} // even the first node now has a node before it
	prev := dummy
	for prev.Next != nil {
		if prev.Next.Val == val {
			prev.Next = prev.Next.Next // unlink it, and stay put
		} else {
			prev = prev.Next
		}
	}
	return dummy.Next // not head: head may be gone
}

func removeNthFromEnd(head *ListNode, n int) *ListNode {
	dummy := &ListNode{Next: head}
	lead, trail := dummy, dummy
	for i := 0; i <= n; i++ {
		lead = lead.Next // n + 1 steps ahead
	}
	for lead != nil {
		lead, trail = lead.Next, trail.Next
	}
	trail.Next = trail.Next.Next // trail sits just before the one to remove
	return dummy.Next
}

fmt.Println(toSlice(removeAll(build(6, 1, 6, 2, 6), 6)))        // [1 2]
fmt.Println(toSlice(removeNthFromEnd(build(1, 2, 3, 4, 5), 2))) // [1 2 3 5]
```

### Merge two sorted lists, then k with a heap

```go harness
type ListNode struct {
	Val  int
	Next *ListNode
}

func build(vals ...int) (head *ListNode) {
	for i := len(vals) - 1; i >= 0; i-- {
		head = &ListNode{vals[i], head}
	}
	return
}

func toSlice(n *ListNode) (out []int) {
	for ; n != nil; n = n.Next {
		out = append(out, n.Val)
	}
	return
}
{{code}}
```

```go
import "container/heap"

func mergeTwo(a, b *ListNode) *ListNode {
	dummy := &ListNode{}
	tail := dummy
	for a != nil && b != nil {
		if a.Val <= b.Val {
			tail.Next, a = a, a.Next // splice a's node in
		} else {
			tail.Next, b = b, b.Next
		}
		tail = tail.Next
	}
	tail.Next = a // the rest of one list is already sorted
	if a == nil {
		tail.Next = b
	}
	return dummy.Next
}

type NodeHeap []*ListNode // the smallest Val on top

func (h NodeHeap) Len() int            { return len(h) }
func (h NodeHeap) Less(i, j int) bool  { return h[i].Val < h[j].Val }
func (h NodeHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *NodeHeap) Push(x interface{}) { *h = append(*h, x.(*ListNode)) }
func (h *NodeHeap) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

func mergeK(lists []*ListNode) *ListNode {
	h := NodeHeap{}
	for _, head := range lists {
		if head != nil {
			h = append(h, head) // the first node of each list
		}
	}
	heap.Init(&h)
	dummy := &ListNode{}
	tail := dummy
	for h.Len() > 0 {
		node := heap.Pop(&h).(*ListNode)
		tail.Next, tail = node, node
		if node.Next != nil {
			heap.Push(&h, node.Next) // that list's next node takes its place
		}
	}
	return dummy.Next
}

fmt.Println(toSlice(mergeTwo(build(1, 2, 4), build(1, 3, 4)))) // [1 1 2 3 4 4]
lists := []*ListNode{build(1, 4, 7), build(2, 5), nil, build(0, 6)}
fmt.Println(toSlice(mergeK(lists))) // [0 1 2 4 5 6 7]
```

### Fast and slow pointers: the middle and a cycle

```go harness
type ListNode struct {
	Val  int
	Next *ListNode
}
{{code}}
```

```go
var head *ListNode
for v := 5; v >= 1; v-- {
	head = &ListNode{Val: v, Next: head} // builds 1 2 3 4 5
}
slow, fast := head, head
for fast != nil && fast.Next != nil {
	slow, fast = slow.Next, fast.Next.Next
}
fmt.Println(slow.Val) // 3, the middle (the second middle for an even length)

head.Next.Next.Next.Next.Next = head.Next // the tail now points back at 2
hasCycle := false
slow, fast = head, head
for fast != nil && fast.Next != nil {
	slow, fast = slow.Next, fast.Next.Next
	if slow == fast { // the same node, not just the same value
		hasCycle = true
		break
	}
}
fmt.Println(hasCycle) // true
```

### Doubly linked list with sentinels (for an LRU cache)

Two fake nodes at the ends mean insert and remove never check for `nil`. An LRU cache pairs this list with a `map[int]*DNode`, moves a node to the front on every use, and drops `tail.Prev` when it is full.

```go
type DNode struct {
	Key, Val   int
	Prev, Next *DNode
}

func remove(n *DNode) {
	n.Prev.Next = n.Next
	n.Next.Prev = n.Prev
}

func pushFront(head, n *DNode) {
	n.Prev, n.Next = head, head.Next
	head.Next.Prev = n
	head.Next = n
}

head, tail := &DNode{}, &DNode{}
head.Next, tail.Prev = tail, head
a, b := &DNode{Key: 1, Val: 10}, &DNode{Key: 2, Val: 20}
pushFront(head, a)
pushFront(head, b)
remove(a)
pushFront(head, a) // a was just used, so it moves back to the front
for n := head.Next; n != tail; n = n.Next {
	fmt.Print(n.Key, " ") // 1 2, front to back
}
fmt.Println()
```

### Gotchas

- Save `cur.Next` before you overwrite it, or the rest of the list is lost.
- Check `fast != nil` before `fast.Next`. `&&` stops at the first false, which avoids a nil pointer dereference panic.
- `fmt.Println(node)` prints `&{1 0xc000010030}`, an address that changes every run. Print `node.Val`, or the values as a slice.
