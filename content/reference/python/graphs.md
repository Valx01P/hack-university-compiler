# Graphs

Python has no graph type. Store an adjacency list, each node's neighbors in a list, either as a list of lists for nodes `0` to `n - 1` or as a `defaultdict(list)` for any labels. Search it with a `deque` for BFS, and with recursion or a list as a stack for DFS. A grid is a graph too: a cell's neighbors are one step in each direction.

### Adjacency list from an edge list

```python
from collections import defaultdict

edges = [(0, 1), (0, 2), (1, 3), (2, 3)]
n = 4
adj = [[] for _ in range(n)]
for u, v in edges:
    adj[u].append(v)
    adj[v].append(u)          # leave this out for a directed graph
print(adj)                    # [[1, 2], [0, 3], [0, 3], [1, 2]]

graph = defaultdict(list)     # labels instead of 0 to n - 1
for u, v in [("a", "b"), ("b", "c")]:
    graph[u].append(v)
    graph[v].append(u)
print(dict(graph))            # {'a': ['b'], 'b': ['a', 'c'], 'c': ['b']}

weighted = defaultdict(list)
weighted["a"].append(("b", 7))   # (neighbor, weight)
print(weighted["a"])          # [('b', 7)]
```

For nodes numbered 1 to n, make `n + 1` lists and leave index 0 unused.

### BFS: fewest edges from a start

```python
from collections import deque

def bfs(adj, start):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for nxt in adj[node]:
            if nxt not in dist:            # mark it when you add it
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return dist

adj = [[1, 2], [0, 3], [0, 3], [1, 2], []]
dist = bfs(adj, 0)
print(dist)                                # {0: 0, 1: 1, 2: 1, 3: 2}
print(dist.get(3, -1), dist.get(4, -1))    # 2 -1  -1 when unreachable
```

### DFS: by recursion and by a stack

```python
def dfs(adj, node, seen):
    seen.add(node)
    for nxt in adj[node]:
        if nxt not in seen:
            dfs(adj, nxt, seen)

def dfs_stack(adj, start):
    seen = {start}
    stack = [start]
    order = []
    while stack:
        node = stack.pop()
        order.append(node)
        for nxt in adj[node]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return order

adj = [[1, 2], [0, 3], [0, 3], [1, 2], []]
seen = set()
dfs(adj, 0, seen)
print(sorted(seen))           # [0, 1, 2, 3]
print(dfs_stack(adj, 0))      # [0, 2, 3, 1]
components = 0
seen = set()
for node in range(len(adj)):
    if node not in seen:      # an unseen node starts a new component
        components += 1
        dfs(adj, node, seen)
print(components)             # 2
```

### Grids: direction tuples, islands by DFS

```python
grid = [list("11000"), list("11000"), list("00100"), list("00011")]
rows, cols = len(grid), len(grid[0])
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]

def sink(r, c):
    grid[r][c] = "0"                       # mark it visited
    for dr, dc in DIRS:
        nr, nc = r + dr, c + dc
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1":
            sink(nr, nc)

islands = 0
for r in range(rows):
    for c in range(cols):
        if grid[r][c] == "1":
            islands += 1
            sink(r, c)
print(islands)                             # 3
```

All 8 neighbors: `[(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc]`.

### Grids: BFS by levels, from many starts

Rotting oranges: every rotten cell starts in the queue, and each level of the BFS is one minute.

```python
from collections import deque

grid = [[2, 1, 1], [1, 1, 0], [0, 1, 1]]
rows, cols = len(grid), len(grid[0])
queue = deque((r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 2)
fresh = sum(row.count(1) for row in grid)
minutes = 0
while queue and fresh:
    for _ in range(len(queue)):            # only this minute's cells
        r, c = queue.popleft()
        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                grid[nr][nc] = 2
                fresh -= 1
                queue.append((nr, nc))
    minutes += 1
print(minutes if fresh == 0 else -1)       # 4
```

### Topological sort (Kahn's algorithm)

Count each node's incoming edges. Start from the nodes with none, and each one you take frees its neighbors. If some nodes never reach 0, there's a cycle.

```python
from collections import deque

def topo_order(n, prereqs):                # (course, needs) pairs
    adj = [[] for _ in range(n)]
    indegree = [0] * n
    for course, needs in prereqs:
        adj[needs].append(course)
        indegree[course] += 1
    queue = deque(i for i in range(n) if indegree[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in adj[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return order if len(order) == n else []

print(topo_order(4, [(1, 0), (2, 0), (3, 1), (3, 2)]))   # [0, 1, 2, 3]
print(topo_order(2, [(1, 0), (0, 1)]))                   # []  a cycle
```

For the smallest order when several nodes are ready, use a heap instead of the deque. `graphlib.TopologicalSorter` is the built-in version, and it raises `CycleError` on a cycle.

### Union find

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.count = n                     # components

    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])   # path compression
        return self.parent[x]

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False                   # already joined: this edge closes a cycle
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra               # the smaller tree goes under the bigger
        self.size[ra] += self.size[rb]
        self.count -= 1
        return True

uf = UnionFind(5)
for a, b in [(0, 1), (1, 2), (3, 4)]:
    uf.union(a, b)
print(uf.count, uf.find(2) == uf.find(0), uf.union(0, 2))   # 2 True False
```

### Dijkstra: shortest paths with weights

```python
import heapq

def dijkstra(adj, src):                    # adj[u] is a list of (v, weight)
    dist = [float("inf")] * len(adj)
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue                       # a stale entry, u was reached cheaper
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(heap, (dist[v], v))
    return dist

adj = [[] for _ in range(4)]
for u, v, w in [(0, 1, 4), (0, 2, 1), (2, 1, 2), (1, 3, 1)]:
    adj[u].append((v, w))                  # directed
dist = dijkstra(adj, 0)
print(dist)                                # [0, 3, 1, 4]
print(max(dist) if max(dist) < float("inf") else -1)   # 4  the time to reach them all
```

### Gotchas

- Mark a node seen when you add it to the queue, not when you pop it, or BFS adds the same node many times.
- Recursive DFS on a large grid goes one call per cell: a 100 by 100 island passes the default limit of 1000. Call `sys.setrecursionlimit(10**6)` or use a stack.
- Reading `graph[x]` on a `defaultdict` adds `x` as a key. Doing that while looping over `graph` raises `RuntimeError`. Loop over `list(graph)`, or use `graph.get(x, [])`.
- Negative indexes wrap around, so `grid[-1][c]` reads the last row instead of failing. Check `0 <= nr < rows` before you index.
