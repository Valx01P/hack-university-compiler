# Graphs

A graph is nodes and edges, and problems hand you an edge list. Turn it into an adjacency list first: an array of arrays when the nodes are `0` to `n - 1`, or a `Map` from a name to an array of names. Then nearly everything is BFS (fewest steps), DFS (reach, count, explore), a topological sort (an order that respects every edge), union find (which nodes connect), or Dijkstra (cheapest path with weights).

### Adjacency list from an edge list

```javascript
const n = 5;
const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
const graph = Array.from({ length: n }, () => []);  // never Array(n).fill([])
for (const [u, v] of edges) {
  graph[u].push(v);
  graph[v].push(u);  // leave this out for a directed graph
}
console.log(graph[3].join(" "));  // 1 2 4

const flights = [["NYC", "LAX"], ["NYC", "SFO"], ["LAX", "SEA"]];
const routes = new Map();
for (const [from, to] of flights) {
  if (!routes.has(from)) routes.set(from, []);
  routes.get(from).push(to);
}
console.log(routes.get("NYC"), routes.get("SEA") ?? []);  // [ 'LAX', 'SFO' ] []
```

### BFS: fewest edges from a start

Mark a node when you add it to the queue, not when you take it out, so it is never queued twice.

```javascript
const graph = [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3], []];
const dist = new Array(graph.length).fill(-1);  // -1 means not reached yet
dist[0] = 0;
const queue = [0];
for (let head = 0; head < queue.length; head++) {
  const u = queue[head];
  for (const v of graph[u]) {
    if (dist[v] === -1) {
      dist[v] = dist[u] + 1;
      queue.push(v);
    }
  }
}
console.log(dist.join(" "));  // 0 1 1 2 3 -1, node 5 is unreachable
```

### DFS: by recursion and by a stack, and counting components

```javascript
const graph = [[1], [0, 2], [1], [4], [3], []];
const seen = new Array(graph.length).fill(false);
function dfs(u) {
  seen[u] = true;
  for (const v of graph[u]) if (!seen[v]) dfs(v);
}
let components = 0;
for (let u = 0; u < graph.length; u++) {
  if (!seen[u]) {
    dfs(u);
    components++;
  }
}
console.log(components);  // 3: {0,1,2}, {3,4}, {5}

const visited = new Set([0]);  // the same walk with a stack, no recursion limit
const stack = [0];
while (stack.length > 0) {
  const u = stack.pop();
  for (const v of graph[u]) {
    if (!visited.has(v)) {
      visited.add(v);
      stack.push(v);
    }
  }
}
console.log([...visited].sort((a, b) => a - b).join(" "));  // 0 1 2
```

### Grids: direction arrays, islands by DFS

```javascript
const grid = [
  "11000",
  "11010",
  "00011",
].map((row) => row.split(""));
const rows = grid.length;
const cols = grid[0].length;
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];  // down, up, right, left
function sink(r, c) {
  if (r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] !== "1") return;
  grid[r][c] = "0";  // mark visited by changing the cell
  for (const [dr, dc] of dirs) sink(r + dr, c + dc);
}
let islands = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (grid[r][c] === "1") {
      sink(r, c);
      islands++;
    }
  }
}
console.log(islands);  // 2
```

### Grids: BFS from many starts, by levels

Put every source in the queue first. Each level of the BFS is one minute. This is rotting oranges: `2` rots its neighbors, `1` is fresh, `0` is empty.

```javascript
const grid = [
  [2, 1, 1],
  [1, 1, 0],
  [0, 1, 1],
];
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let queue = [];
let fresh = 0;
grid.forEach((row, r) => row.forEach((cell, c) => {
  if (cell === 2) queue.push([r, c]);
  if (cell === 1) fresh++;
}));
let minutes = 0;
while (queue.length > 0 && fresh > 0) {
  const next = [];
  for (const [r, c] of queue) {
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (grid[nr]?.[nc] === 1) {  // ?. turns an outside row into undefined
        grid[nr][nc] = 2;
        fresh--;
        next.push([nr, nc]);
      }
    }
  }
  queue = next;
  minutes++;
}
console.log(fresh === 0 ? minutes : -1);  // 4
```

### Topological sort (Kahn's algorithm)

Count each node's incoming edges, start from the nodes with none, and remove edges as you go. If some nodes never reach zero, there is a cycle.

```javascript
const n = 4;
const prereqs = [[1, 0], [2, 0], [3, 1], [3, 2]];  // [course, needs this first]
const graph = Array.from({ length: n }, () => []);
const indegree = new Array(n).fill(0);
for (const [course, first] of prereqs) {
  graph[first].push(course);
  indegree[course]++;
}
const order = [];
const queue = [];
for (let u = 0; u < n; u++) if (indegree[u] === 0) queue.push(u);
for (let head = 0; head < queue.length; head++) {
  const u = queue[head];
  order.push(u);
  for (const v of graph[u]) {
    if (--indegree[v] === 0) queue.push(v);
  }
}
console.log(order.length === n ? order.join(" ") : "cycle");  // 0 1 2 3
```

### Union find

```javascript
const parent = Array.from({ length: 6 }, (_, i) => i);  // each node is its own set
const size = new Array(6).fill(1);
function find(x) {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]];  // path compression: skip a level
    x = parent[x];
  }
  return x;
}
function union(a, b) {
  let ra = find(a);
  let rb = find(b);
  if (ra === rb) return false;  // already connected: this edge makes a cycle
  if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
  parent[rb] = ra;              // hang the smaller tree under the bigger one
  size[ra] += size[rb];
  return true;
}
let sets = 6;
for (const [a, b] of [[0, 1], [1, 2], [3, 4], [2, 0]]) if (union(a, b)) sets--;
console.log(sets, find(2) === find(0), find(3) === find(5));  // 3 true false
```

### Dijkstra: cheapest path with weights

A min-heap of `[distance, node]`. Skip an entry that is older than the best distance found since.

```javascript
const { PriorityQueue } = require("@datastructures-js/priority-queue");
const n = 4;
const edges = [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5]];  // [from, to, weight]
const graph = Array.from({ length: n }, () => []);
for (const [u, v, w] of edges) graph[u].push([v, w]);
const dist = new Array(n).fill(Infinity);
dist[0] = 0;
const heap = new PriorityQueue((a, b) => a[0] - b[0]);
heap.enqueue([0, 0]);
while (!heap.isEmpty()) {
  const [d, u] = heap.dequeue();
  if (d > dist[u]) continue;  // a stale entry
  for (const [v, w] of graph[u]) {
    if (d + w < dist[v]) {
      dist[v] = d + w;
      heap.enqueue([dist[v], v]);
    }
  }
}
console.log(dist.join(" "));  // 0 3 1 4
console.log(dist.includes(Infinity) ? -1 : Math.max(...dist));  // 4, the time for every node
```

### Gotchas

- `Array(n).fill([])` gives every node the same array, so one `push` shows up everywhere. Use `Array.from({ length: n }, () => [])`.
- A recursive DFS over a big grid (about 10,000 cells in one path) throws `RangeError: Maximum call stack size exceeded`. Switch to a stack or a BFS.
- Arrays as Set or Map keys compare by reference: `seen.has([r, c])` is always `false`. Use a string key such as `"3,4"`, built with a template string, or the number `r * cols + c`.
- BFS gives fewest edges only when every edge costs the same. With weights, use Dijkstra.
