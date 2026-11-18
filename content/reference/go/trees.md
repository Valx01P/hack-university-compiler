# Trees

A binary tree node in Go is a struct with two child pointers, LeetCode's `TreeNode`, and a `nil` pointer means no child. Most tree problems are a short recursive function that handles `nil` first, then combines what the left and right subtrees return. Traversals and BFS visit each node once, O(n).

### The node (LeetCode shape) and a builder

```go
import (
	"strconv"
	"strings"
)

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

// build makes a tree from level order tokens, with "null" for a missing child.
func build(tokens []string) *TreeNode {
	nodes := make([]*TreeNode, len(tokens))
	for i, t := range tokens {
		if v, err := strconv.Atoi(t); err == nil { // "null" isn't a number: no node
			nodes[i] = &TreeNode{Val: v}
		}
	}
	child := 1 // each real node takes the next two tokens as its children
	for _, n := range nodes {
		if n == nil {
			continue
		}
		if child < len(nodes) {
			n.Left = nodes[child]
		}
		if child+1 < len(nodes) {
			n.Right = nodes[child+1]
		}
		child += 2
	}
	if len(nodes) == 0 {
		return nil
	}
	return nodes[0]
}

//       4
//      / \
//     2   6
//    / \   \
//   1   3   7
root := build(strings.Fields("4 2 6 1 3 null 7"))          // a line of input, split on spaces
fmt.Println(root.Val, root.Left.Val, root.Right.Right.Val) // 4 2 7
fmt.Println(root.Right.Left == nil)                        // true, the null
```

### Preorder, inorder, postorder (recursion)

A closure that calls itself is declared with `var` first, so its name exists inside its own body. It can append to slices outside it.

```go harness
type TreeNode struct{ Val int; Left, Right *TreeNode }
root := &TreeNode{4, &TreeNode{2, &TreeNode{Val: 1}, &TreeNode{Val: 3}}, &TreeNode{6, nil, &TreeNode{Val: 7}}}
{{code}}
```

```go
var pre, in, post []int
var walk func(n *TreeNode)
walk = func(n *TreeNode) {
	if n == nil {
		return
	}
	pre = append(pre, n.Val) // before the children
	walk(n.Left)
	in = append(in, n.Val) // between them
	walk(n.Right)
	post = append(post, n.Val) // after them
}
walk(root)        // the tree above
fmt.Println(pre)  // [4 2 1 3 6 7]
fmt.Println(in)   // [1 2 3 4 6 7], sorted for a binary search tree
fmt.Println(post) // [1 3 2 7 6 4]
```

### Inorder and preorder with a stack

```go harness
type TreeNode struct{ Val int; Left, Right *TreeNode }
root := &TreeNode{4, &TreeNode{2, &TreeNode{Val: 1}, &TreeNode{Val: 3}}, &TreeNode{6, nil, &TreeNode{Val: 7}}}
{{code}}
```

```go
in := []int{}
stack := []*TreeNode{}
cur := root
for cur != nil || len(stack) > 0 {
	for cur != nil { // go as far left as you can
		stack = append(stack, cur)
		cur = cur.Left
	}
	cur = stack[len(stack)-1]
	stack = stack[:len(stack)-1]
	in = append(in, cur.Val)
	cur = cur.Right
}
fmt.Println(in) // [1 2 3 4 6 7]

pre := []int{}
stack = []*TreeNode{root}
for len(stack) > 0 {
	n := stack[len(stack)-1]
	stack = stack[:len(stack)-1]
	pre = append(pre, n.Val)
	if n.Right != nil {
		stack = append(stack, n.Right) // right first, so left pops first
	}
	if n.Left != nil {
		stack = append(stack, n.Left)
	}
}
fmt.Println(pre) // [4 2 1 3 6 7]
```

### Level order (BFS)

Save the queue's length before each round, and that many nodes are one level.

```go harness
type TreeNode struct{ Val int; Left, Right *TreeNode }
root := &TreeNode{4, &TreeNode{2, &TreeNode{Val: 1}, &TreeNode{Val: 3}}, &TreeNode{6, nil, &TreeNode{Val: 7}}}
{{code}}
```

```go
levels := [][]int{}
queue := []*TreeNode{}
if root != nil {
	queue = append(queue, root)
}
for len(queue) > 0 {
	level := []int{}
	for size := len(queue); size > 0; size-- {
		n := queue[0]
		queue = queue[1:]
		level = append(level, n.Val)
		if n.Left != nil {
			queue = append(queue, n.Left)
		}
		if n.Right != nil {
			queue = append(queue, n.Right)
		}
	}
	levels = append(levels, level)
}
fmt.Println(levels) // [[4] [2 6] [1 3 7]]
```

### Depth and size

```go harness
type TreeNode struct{ Val int; Left, Right *TreeNode }
root := &TreeNode{4, &TreeNode{2, &TreeNode{Val: 1}, &TreeNode{Val: 3}}, &TreeNode{6, nil, &TreeNode{Val: 7}}}
{{code}}
```

```go
func height(n *TreeNode) int {
	if n == nil {
		return 0
	}
	l, r := height(n.Left), height(n.Right)
	if l > r { // no built-in max for ints in Go 1.16
		return l + 1
	}
	return r + 1
}

func size(n *TreeNode) int {
	if n == nil {
		return 0
	}
	return 1 + size(n.Left) + size(n.Right)
}

fmt.Println(height(root), size(root)) // 3 6
```

### Binary search tree: insert, search, validate

Smaller values go left and larger ones right, so search walks one path down, O(height).

```go harness
type TreeNode struct{ Val int; Left, Right *TreeNode }
{{code}}
```

```go
func insert(n *TreeNode, v int) *TreeNode {
	if n == nil {
		return &TreeNode{Val: v}
	}
	if v < n.Val {
		n.Left = insert(n.Left, v)
	} else if v > n.Val {
		n.Right = insert(n.Right, v) // an equal value is ignored
	}
	return n
}

func search(n *TreeNode, v int) bool {
	for n != nil && n.Val != v {
		if v < n.Val {
			n = n.Left
		} else {
			n = n.Right
		}
	}
	return n != nil
}

func valid(n *TreeNode, lo, hi int) bool {
	if n == nil {
		return true
	}
	if n.Val <= lo || n.Val >= hi {
		return false // outside the range its ancestors allow
	}
	return valid(n.Left, lo, n.Val) && valid(n.Right, n.Val, hi)
}

var bst *TreeNode
for _, v := range []int{5, 3, 8, 1, 4} {
	bst = insert(bst, v) // keep the returned root
}
fmt.Println(search(bst, 4), search(bst, 7))           // true false
fmt.Println(valid(bst, math.MinInt64, math.MaxInt64)) // true

bad := &TreeNode{5, &TreeNode{Val: 1}, &TreeNode{4, &TreeNode{Val: 3}, &TreeNode{Val: 6}}}
fmt.Println(valid(bad, math.MinInt64, math.MaxInt64)) // false, 4 is in 5's right subtree
```

### Gotchas

- Check `n == nil` first in every recursive function. Reading `n.Left` on a nil pointer panics.
- A helper that appends to a plain `[]int` parameter changes only its own copy of the slice header. Pass `*[]int` and write `*out = append(*out, v)`, or append from a closure.
- `insert` returns the root, so write `root = insert(root, v)`. Otherwise the first insert into an empty tree is lost.
- Checking each node only against its parent misses deeper violations. Pass bounds down, starting at `math.MinInt64` and `math.MaxInt64` (`int` is 64 bits here, and `math.MaxInt` doesn't exist in Go 1.16).
