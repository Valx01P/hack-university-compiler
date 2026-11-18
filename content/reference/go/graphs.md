# Graphs

Number the nodes 0 to n - 1 and keep an adjacency list, `adj := make([][]int, n)`, one slice of neighbors per node, or a `map[string][]string` when the nodes have names. BFS with a queue finds the fewest edges, DFS explores, Kahn's algorithm orders tasks, union find groups nodes, and Dijkstra with `container/heap` finds the cheapest weighted route. BFS, DFS, and Kahn's take O(V + E), and Dijkstra O(E log V).

### Adjacency list and BFS (fewest edges)

```go
n := 5
edges := [][]int{{0, 1}, {0, 2}, {1, 3}}
adj := make([][]int, n) // n nil slices, and append works on nil
for _, e := range edges {
	adj[e[0]] = append(adj[e[0]], e[1])
	adj[e[1]] = append(adj[e[1]], e[0]) // undirected: both ways, directed: only the line above
}
fmt.Println(adj) // [[1 2] [0 3] [0] [1] []]
dist := make([]int, n)
for i := range dist {
	dist[i] = -1 // -1: not reached yet
}
dist[0] = 0
queue := []int{0}
for len(queue) > 0 {
	node := queue[0]
	queue = queue[1:]
	for _, next := range adj[node] {
		if dist[next] == -1 { // mark when you enqueue
			dist[next] = dist[node] + 1
			queue = append(queue, next)
		}
	}
}
fmt.Println(dist) // [0 1 1 2 -1], node 4 is unreachable
```

### DFS: by recursion and by a stack

```go harness
adj, n := [][]int{{1, 2}, {0, 3}, {0}, {1}, {}}, 5
{{code}}
```

```go
seen, order := make([]bool, n), []int{}
var dfs func(node int) // declared first, so it can call itself
dfs = func(node int) {
	seen[node] = true // mark first
	order = append(order, node)
	for _, next := range adj[node] {
		if !seen[next] {
			dfs(next)
		}
	}
}
dfs(0)
fmt.Println(order) // [0 1 3 2]

seen = make([]bool, n)
stack := []int{0}
for len(stack) > 0 {
	node := stack[len(stack)-1]
	stack = stack[:len(stack)-1]
	if seen[node] {
		continue
	}
	seen[node] = true
	fmt.Print(node, " ") // 0 2 1 3: the last neighbor pushed pops first
	stack = append(stack, adj[node]...)
}
```

To count connected components, launch `dfs` from every node that is still unvisited: each launch is one component.

### Grids: direction arrays, DFS for islands, BFS by levels

Number of islands sinks each island it finds with a DFS. Rotting oranges starts a BFS from every rotten cell (2) at once, and each level is one minute.

```go
var dirs = [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} // down, up, right, left

func sink(grid [][]byte, r, c int) {
	if r < 0 || r >= len(grid) || c < 0 || c >= len(grid[0]) || grid[r][c] != '1' {
		return // off the grid, water, or already visited
	}
	grid[r][c] = '0' // mark before recursing
	for _, d := range dirs {
		sink(grid, r+d[0], c+d[1])
	}
}

grid := [][]byte{[]byte("11000"), []byte("11010"), []byte("00011")} // []byte copies, so cells can change
islands := 0
for r := range grid {
	for c := range grid[r] {
		if grid[r][c] == '1' {
			islands++
			sink(grid, r, c)
		}
	}
}
fmt.Println(islands) // 2

oranges := [][]int{{2, 1, 1}, {1, 1, 0}, {0, 1, 1}}
queue, fresh, minutes := [][2]int{}, 0, 0
for r, row := range oranges {
	for c, v := range row {
		if v == 2 {
			queue = append(queue, [2]int{r, c})
		} else if v == 1 {
			fresh++
		}
	}
}
for len(queue) > 0 && fresh > 0 {
	for size := len(queue); size > 0; size-- { // only this minute's cells
		cur := queue[0]
		queue = queue[1:]
		for _, d := range dirs {
			r, c := cur[0]+d[0], cur[1]+d[1]
			if r >= 0 && r < len(oranges) && c >= 0 && c < len(oranges[0]) && oranges[r][c] == 1 {
				oranges[r][c] = 2
				fresh--
				queue = append(queue, [2]int{r, c})
			}
		}
	}
	minutes++
}
if fresh > 0 {
	minutes = -1 // some orange can never rot
}
fmt.Println(minutes) // 4
```

### Topological sort (Kahn's algorithm)

```go
n := 4
prereqs := [][]int{{1, 0}, {2, 0}, {3, 1}, {3, 2}} // {course, the course it needs first}
after, indegree := make([][]int, n), make([]int, n)
for _, p := range prereqs {
	after[p[1]] = append(after[p[1]], p[0])
	indegree[p[0]]++
}
ready := []int{}
for i := 0; i < n; i++ {
	if indegree[i] == 0 {
		ready = append(ready, i) // waits for nothing
	}
}
order := []int{}
for len(ready) > 0 {
	node := ready[0]
	ready = ready[1:]
	order = append(order, node)
	for _, v := range after[node] {
		indegree[v]--
		if indegree[v] == 0 {
			ready = append(ready, v)
		}
	}
}
fmt.Println(order, len(order) == n) // [0 1 2 3] true, false would mean a cycle
```

### Union find

```go
type UnionFind struct {
	parent []int
	count  int // how many groups
}

func (uf *UnionFind) Find(x int) int {
	if uf.parent[x] != x {
		uf.parent[x] = uf.Find(uf.parent[x]) // path compression
	}
	return uf.parent[x]
}

func (uf *UnionFind) Union(a, b int) bool {
	ra, rb := uf.Find(a), uf.Find(b)
	if ra == rb {
		return false // already one group
	}
	uf.parent[rb] = ra
	uf.count--
	return true
}

uf := &UnionFind{parent: make([]int, 5), count: 5}
for i := range uf.parent {
	uf.parent[i] = i // each node starts alone
}
uf.Union(0, 1)
uf.Union(1, 2)
uf.Union(3, 4)
fmt.Println(uf.count, uf.Find(0) == uf.Find(2), uf.Union(2, 0)) // 2 true false: the last edge would close a cycle
```

### Dijkstra with container/heap

```go
import "container/heap"

type Item struct{ node, dist int }
type PQ []Item // the smallest dist on top

func (h PQ) Len() int            { return len(h) }
func (h PQ) Less(i, j int) bool  { return h[i].dist < h[j].dist }
func (h PQ) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *PQ) Push(x interface{}) { *h = append(*h, x.(Item)) }
func (h *PQ) Pop() interface{} {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

n := 4
edges := [][]int{{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}} // {from, to, weight}
adj := make([][][2]int, n)                                   // adj[u] holds {to, weight} pairs
for _, e := range edges {
	adj[e[0]] = append(adj[e[0]], [2]int{e[1], e[2]})
}
dist := make([]int, n)
for i := 1; i < n; i++ {
	dist[i] = math.MaxInt64 // not reached yet, and dist[0] stays 0
}
pq := &PQ{{node: 0, dist: 0}}
for pq.Len() > 0 {
	cur := heap.Pop(pq).(Item)
	if cur.dist > dist[cur.node] {
		continue // stale: a shorter route was found later
	}
	for _, e := range adj[cur.node] {
		if nd := cur.dist + e[1]; nd < dist[e[0]] {
			dist[e[0]] = nd
			heap.Push(pq, Item{e[0], nd})
		}
	}
}
fmt.Println(dist) // [0 3 1 8]
worst := 0
for _, d := range dist {
	if d > worst {
		worst = d // math.MaxInt64 when some node is never reached
	}
}
if worst == math.MaxInt64 {
	worst = -1
}
fmt.Println(worst) // 8, the time for every node to hear (network delay)
```

### Gotchas

- Mark a node visited when you enqueue it, not when you dequeue it, or it enters the queue many times.
- `dfs := func(...)` can't call itself: the name doesn't exist yet inside its own body. Declare `var dfs func(int)` first, then assign.
- `math.MaxInt64 + w` wraps to a negative number. Add weights only to popped distances, which are real ones. And `math.MaxInt` doesn't exist in Go 1.16.
