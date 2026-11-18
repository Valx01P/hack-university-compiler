# Graphs as Adjacency Lists

A graph is nodes and edges, and problems hand you an edge list. Turn it into an adjacency list first: a `number[][]` when the nodes are `0` to `n - 1`, or a `Map<string, string[]>` for named nodes. Then nearly everything is BFS (fewest steps), DFS (reach, count, explore), a topological sort (an order that respects every edge), union find (which nodes connect), or Dijkstra (cheapest path with weights). Here `graph[u]` is `number[] | undefined` and `dist[v]` is `number | undefined`, so loop over `graph[u] ?? []` and read with `??`.

### Adjacency list from an edge list

`Array.from` with a function gives every node its own array. The annotation matters: without it the type is `never[][]`.

```typescript
const n = 5;
const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
const graph: number[][] = Array.from({ length: n }, () => []);
for (const [u, v] of edges) {
  graph[u]?.push(v);
  graph[v]?.push(u);  // leave this out for a directed graph
}
console.log(graph[3]?.join(" "));  // 1 2 4

const routes = new Map<string, string[]>();
for (const [from, to] of [["NYC", "LAX"], ["NYC", "SFO"], ["LAX", "SEA"]] satisfies [string, string][]) {
  let list = routes.get(from);
  if (list === undefined) {  // the first edge from here
    list = [];
    routes.set(from, list);
  }
  list.push(to);
}
console.log(routes.get("NYC"), routes.get("SEA") ?? []);  // [ 'LAX', 'SFO' ] []
```

### BFS: fewest edges from a start

Mark a node when you add it to the queue, not when you take it out, so it is never queued twice. A `for...of` over the queue also visits the nodes pushed during the loop.

```typescript
const graph: number[][] = [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3], []];
const dist = new Array<number>(graph.length).fill(-1);  // -1 means not reached yet
dist[0] = 0;
const queue = [0];
for (const u of queue) {
  const d = dist[u] ?? 0;
  for (const v of graph[u] ?? []) {
    if (dist[v] === -1) {
      dist[v] = d + 1;
      queue.push(v);
    }
  }
}
console.log(dist.join(" "));  // 0 1 1 2 3 -1, node 5 is unreachable
```

### DFS: by recursion and by a stack, and counting components

```typescript
const graph: number[][] = [[1], [0, 2], [1], [4], [3], []];
const seen = new Array<boolean>(graph.length).fill(false);
function dfs(u: number): void {
  seen[u] = true;
  for (const v of graph[u] ?? []) if (!seen[v]) dfs(v);
}
let components = 0;
for (const [u, done] of seen.entries()) {  // entries() reads live, so dfs's marks show up
  if (!done) {
    dfs(u);
    components++;
  }
}
console.log(components);  // 3: {0,1,2}, {3,4}, {5}

const visited = new Set([0]);  // the same walk with a stack, no recursion limit
const stack = [0];
for (let u = stack.pop(); u !== undefined; u = stack.pop()) {
  for (const v of graph[u] ?? []) {
    if (!visited.has(v)) {
      visited.add(v);
      stack.push(v);
    }
  }
}
console.log([...visited].sort((a, b) => a - b).join(" "));  // 0 1 2
```

### Grids: direction tuples, islands by DFS

A cell outside the grid reads `undefined`, so `row?.[c] !== "1"` is the bounds check and the narrowing in one.

```typescript
const grid = ["11000", "11010", "00011"].map((line) => [...line]);
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];  // down, up, right, left
function sink(r: number, c: number): void {
  const row = grid[r];
  if (row?.[c] !== "1") return;  // off the grid, water, or seen
  row[c] = "0";                  // mark visited by changing the cell
  for (const [dr, dc] of dirs) sink(r + dr, c + dc);
}
let islands = 0;
for (const [r, row] of grid.entries()) {
  for (const [c, cell] of row.entries()) {
    if (cell === "1") {
      sink(r, c);
      islands++;
    }
  }
}
console.log(islands);  // 2
```

### Grids: BFS from many starts, by levels

Put every source in the queue first. Each level of the BFS is one minute. This is rotting oranges: `2` rots its neighbors, `1` is fresh, `0` is empty.

```typescript
const grid = [[2, 1, 1], [1, 1, 0], [0, 1, 1]];
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let level: [number, number][] = [];
let fresh = 0;
for (const [r, row] of grid.entries()) {
  for (const [c, cell] of row.entries()) {
    if (cell === 2) level.push([r, c]);
    if (cell === 1) fresh++;
  }
}
let minutes = 0;
while (level.length > 0 && fresh > 0) {
  const next: [number, number][] = [];
  for (const [r, c] of level) {
    for (const [dr, dc] of dirs) {
      const row = grid[r + dr];
      if (row?.[c + dc] === 1) {
        row[c + dc] = 2;
        fresh--;
        next.push([r + dr, c + dc]);
      }
    }
  }
  level = next;
  minutes++;
}
console.log(fresh === 0 ? minutes : -1);  // 4
```

### Topological sort (Kahn's algorithm)

Count each node's incoming edges, start from the nodes with none, and remove edges as you go. If some nodes never reach zero, there is a cycle. `indegree[v]--` is TS2532 here, so write the new count back.

```typescript
const n = 4;
const prereqs: [course: number, first: number][] = [[1, 0], [2, 0], [3, 1], [3, 2]];
const graph: number[][] = Array.from({ length: n }, () => []);
const indegree = new Array<number>(n).fill(0);
for (const [course, first] of prereqs) {
  graph[first]?.push(course);
  indegree[course] = (indegree[course] ?? 0) + 1;
}
const order = [...indegree.keys()].filter((u) => indegree[u] === 0);
for (const u of order) {  // order grows as nodes are freed
  for (const v of graph[u] ?? []) {
    const left = (indegree[v] ?? 0) - 1;
    indegree[v] = left;
    if (left === 0) order.push(v);
  }
}
console.log(order.length === n ? order.join(" ") : "cycle");  // 0 1 2 3
```

### Union find

```typescript
class UnionFind {
  #parent: number[];
  #size: number[];
  sets: number;

  constructor(n: number) {
    this.#parent = Array.from({ length: n }, (_, i) => i);  // each node is its own set
    this.#size = new Array<number>(n).fill(1);
    this.sets = n;
  }

  find(x: number): number {
    for (let p = this.#parent[x] ?? x; p !== x; p = this.#parent[x] ?? x) {
      const grand = this.#parent[p] ?? p;
      this.#parent[x] = grand;  // path compression: skip a level
      x = grand;
    }
    return x;
  }

  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;  // already connected: this edge makes a cycle
    if ((this.#size[ra] ?? 1) < (this.#size[rb] ?? 1)) [ra, rb] = [rb, ra];
    this.#parent[rb] = ra;        // hang the smaller tree under the bigger one
    this.#size[ra] = (this.#size[ra] ?? 1) + (this.#size[rb] ?? 1);
    this.sets--;
    return true;
  }
}
const uf = new UnionFind(6);
for (const [a, b] of [[0, 1], [1, 2], [3, 4], [2, 0]] satisfies [number, number][]) uf.union(a, b);
console.log(uf.sets, uf.find(2) === uf.find(0), uf.find(3) === uf.find(5));  // 3 true false
```

### Dijkstra: cheapest path with weights

A min heap of `[distance, node]` tuples, with `Heap<T>` from Typed Heaps and Priority Queues. Skip an entry that is older than the best distance found since.

```typescript harness
class Heap<T> {
  private items: T[];
  private compare: (a: T, b: T) => number;
  constructor(compare: (a: T, b: T) => number, items: T[] = []) { this.compare = compare; this.items = [...items]; for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) this.siftDown(i); }
  size(): number { return this.items.length; }
  peek(): T | undefined { return this.items[0]; }
  push(item: T): void { this.items.push(item); for (let i = this.items.length - 1; i > 0 && this.before(i, Math.floor((i - 1) / 2)); i = Math.floor((i - 1) / 2)) this.swap(i, Math.floor((i - 1) / 2)); }
  pop(): T | undefined { const top = this.items[0]; const last = this.items.pop(); if (last !== undefined && this.items.length > 0) { this.items[0] = last; this.siftDown(0); } return top; }
  private before(i: number, j: number): boolean { const a = this.items[i]; const b = this.items[j]; return a !== undefined && b !== undefined && this.compare(a, b) < 0; }
  private swap(i: number, j: number): void { const a = this.items[i]; const b = this.items[j]; if (a !== undefined && b !== undefined) { this.items[i] = b; this.items[j] = a; } }
  private siftDown(i: number): void { for (let best = i; ; i = best) { for (const c of [2 * i + 1, 2 * i + 2]) if (this.before(c, best)) best = c; if (best === i) return; this.swap(i, best); } }
}
{{code}}
```

```typescript
const n = 4;
const edges: [from: number, to: number, weight: number][] = [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5]];
const graph: [to: number, weight: number][][] = Array.from({ length: n }, () => []);
for (const [u, v, w] of edges) graph[u]?.push([v, w]);
const dist = new Array<number>(n).fill(Infinity);
dist[0] = 0;
const heap = new Heap<[d: number, node: number]>((a, b) => a[0] - b[0], [[0, 0]]);
for (let entry = heap.pop(); entry !== undefined; entry = heap.pop()) {
  const [d, u] = entry;
  if (d > (dist[u] ?? Infinity)) continue;  // a stale entry
  for (const [v, w] of graph[u] ?? []) {
    if (d + w < (dist[v] ?? Infinity)) {
      dist[v] = d + w;
      heap.push([d + w, v]);
    }
  }
}
console.log(dist.join(" "));                                     // 0 3 1 4
console.log(dist.includes(Infinity) ? -1 : Math.max(...dist));  // 4, the time for every node
```

### Gotchas

- `new Array(n).fill([])` gives every node the same array, and since `new Array(n)` is `any[]`, it type-checks as a `number[][]` too. Use `Array.from({ length: n }, () => [])` with the annotation.
- A recursive DFS over a big grid (about 9,000 cells in one path) throws `RangeError: Maximum call stack size exceeded`. Switch to a stack or a BFS.
- Arrays as Set or Map keys compare by reference: `seen.has([r, c])` is always `false`. Use a string key such as `${r},${c}`, or the number `r * cols + c`.
- BFS gives fewest edges only when every edge costs the same. With weights, use Dijkstra.
