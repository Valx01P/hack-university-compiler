# Graphs

Number the nodes 0 to n - 1 and keep an adjacency list, a `List<List<Integer>>` with one neighbor list per node. BFS finds the fewest edges, DFS explores, Kahn's algorithm orders tasks, union find groups nodes, and Dijkstra finds the cheapest weighted route. BFS, DFS, and Kahn's take O(V + E), a union find call close to O(1), and Dijkstra O(E log V).

### Adjacency list and BFS (fewest edges)

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Queue;

int n = 5;
int[][] edges = {{0, 1}, {0, 2}, {1, 3}};
List<List<Integer>> adj = new ArrayList<>();
for (int i = 0; i < n; i++) {
    adj.add(new ArrayList<>());
}
for (int[] e : edges) {
    adj.get(e[0]).add(e[1]);
    adj.get(e[1]).add(e[0]);            // undirected: both ways, directed: only the line above
}
System.out.println(adj);                // [[1, 2], [0, 3], [0], [1], []]

int[] dist = new int[n];
Arrays.fill(dist, -1);                  // -1: not reached yet
Queue<Integer> queue = new ArrayDeque<>();
dist[0] = 0;
queue.offer(0);
while (!queue.isEmpty()) {
    int node = queue.poll();
    for (int next : adj.get(node)) {
        if (dist[next] == -1) {         // mark when you enqueue
            dist[next] = dist[node] + 1;
            queue.offer(next);
        }
    }
}
System.out.println(Arrays.toString(dist)); // [0, 1, 1, 2, -1], node 4 is unreachable
```

For labels that aren't 0 to n - 1, use a `Map<String, List<String>>` and add with `graph.computeIfAbsent(u, k -> new ArrayList<>()).add(v)`.

### DFS: by recursion and by a stack

```java harness
int n = 5; List<List<Integer>> adj = new ArrayList<>();
for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
for (int[] e : new int[][]{{0, 1}, {0, 2}, {1, 3}}) { adj.get(e[0]).add(e[1]); adj.get(e[1]).add(e[0]); }
{{code}}
```

```java
static void dfs(int node, List<List<Integer>> adj, boolean[] seen, List<Integer> order) {
    seen[node] = true;                  // mark first
    order.add(node);
    for (int next : adj.get(node)) {
        if (!seen[next]) {
            dfs(next, adj, seen, order);
        }
    }
}

List<Integer> order = new ArrayList<>();
dfs(0, adj, new boolean[n], order);
System.out.println(order);              // [0, 1, 3, 2]
boolean[] seen = new boolean[n];
Deque<Integer> stack = new ArrayDeque<>();
stack.push(0);
while (!stack.isEmpty()) {
    int node = stack.pop();
    if (!seen[node]) {
        seen[node] = true;
        System.out.print(node + " ");   // 0 2 1 3, the last neighbor pushed pops first
        for (int next : adj.get(node)) {
            stack.push(next);
        }
    }
}
```

To count connected components, launch `dfs` from every node that is still unvisited: each launch is one component.

### Grids: DFS for islands, BFS by levels

Number of islands sinks each island it finds with a DFS. Rotting oranges starts a BFS from every rotten cell (2) at once, and each level is one minute.

```java
static final int[][] DIRS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

static void sink(char[][] grid, int r, int c) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length || grid[r][c] != '1') {
        return;                         // off the grid, water, or already visited
    }
    grid[r][c] = '0';                   // mark before recursing
    for (int[] d : DIRS) {
        sink(grid, r + d[0], c + d[1]);
    }
}

char[][] map = {"11000".toCharArray(), "11010".toCharArray(), "00011".toCharArray()};
int islands = 0;
for (int r = 0; r < map.length; r++) {
    for (int c = 0; c < map[0].length; c++) {
        if (map[r][c] == '1') {
            islands++;
            sink(map, r, c);
        }
    }
}
System.out.println(islands);            // 2

int[][] grid = {{2, 1, 1}, {1, 1, 0}, {0, 1, 1}};
Queue<int[]> queue = new ArrayDeque<>();
int fresh = 0;
for (int r = 0; r < grid.length; r++) {
    for (int c = 0; c < grid[0].length; c++) {
        if (grid[r][c] == 2) {
            queue.offer(new int[]{r, c});
        } else if (grid[r][c] == 1) {
            fresh++;
        }
    }
}
int minutes = 0;
while (!queue.isEmpty() && fresh > 0) {
    for (int size = queue.size(); size > 0; size--) {   // only this level
        int[] cur = queue.poll();
        for (int[] d : DIRS) {
            int nr = cur[0] + d[0], nc = cur[1] + d[1];
            if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && grid[nr][nc] == 1) {
                grid[nr][nc] = 2;
                fresh--;
                queue.offer(new int[]{nr, nc});
            }
        }
    }
    minutes++;
}
System.out.println(fresh == 0 ? minutes : -1); // 4
```

### Topological sort (Kahn's algorithm)

```java
int n = 4;
int[][] prereqs = {{1, 0}, {2, 0}, {3, 1}, {3, 2}};   // {course, the course it needs first}
List<List<Integer>> after = new ArrayList<>();
for (int i = 0; i < n; i++) {
    after.add(new ArrayList<>());
}
int[] indegree = new int[n];
for (int[] p : prereqs) {
    after.get(p[1]).add(p[0]);
    indegree[p[0]]++;
}
Queue<Integer> ready = new ArrayDeque<>();
for (int i = 0; i < n; i++) {
    if (indegree[i] == 0) {
        ready.offer(i);                 // waits for nothing
    }
}
List<Integer> order = new ArrayList<>();
while (!ready.isEmpty()) {
    int node = ready.poll();
    order.add(node);
    for (int v : after.get(node)) {
        if (--indegree[v] == 0) {
            ready.offer(v);
        }
    }
}
System.out.println(order);              // [0, 1, 2, 3]
System.out.println(order.size() == n);  // true, false would mean a cycle
```

### Union find

```java
class UnionFind {
    int[] parent;
    int count;                          // how many groups
    UnionFind(int n) {
        parent = new int[n];
        count = n;
        for (int i = 0; i < n; i++) parent[i] = i;   // each node starts alone
    }
    int find(int x) {
        if (parent[x] != x) parent[x] = find(parent[x]);   // path compression
        return parent[x];
    }
    boolean union(int a, int b) {
        int ra = find(a);
        int rb = find(b);
        if (ra == rb) {
            return false;               // already in one group
        }
        parent[rb] = ra;
        count--;
        return true;
    }
}

UnionFind uf = new UnionFind(5);
uf.union(0, 1);
uf.union(1, 2);
uf.union(3, 4);
System.out.println(uf.count + " " + (uf.find(0) == uf.find(2)));  // 2 true
System.out.println(uf.union(2, 0));            // false, joining them again would close a cycle
```

### Dijkstra

```java
import java.util.PriorityQueue;

int n = 4;
int[][] edges = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}};    // {from, to, weight}
List<List<int[]>> g = new ArrayList<>();
for (int i = 0; i < n; i++) g.add(new ArrayList<>());
for (int[] e : edges) g.get(e[0]).add(new int[]{e[1], e[2]});    // {to, weight}
int[] dist = new int[n];
Arrays.fill(dist, Integer.MAX_VALUE);
dist[0] = 0;
PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0])); // {distance, node}
pq.offer(new int[]{0, 0});
while (!pq.isEmpty()) {
    int[] cur = pq.poll();
    int u = cur[1];
    if (cur[0] > dist[u]) {
        continue;                       // stale, a shorter route was found later
    }
    for (int[] edge : g.get(u)) {
        int nd = dist[u] + edge[1];
        if (nd < dist[edge[0]]) {
            dist[edge[0]] = nd;
            pq.offer(new int[]{nd, edge[0]});
        }
    }
}
System.out.println(Arrays.toString(dist)); // [0, 3, 1, 8]
int worst = Arrays.stream(dist).max().getAsInt();
System.out.println(worst == Integer.MAX_VALUE ? -1 : worst); // 8, the time for every node to hear (network delay)
```

### Gotchas

- Mark a node visited when you enqueue it, not when you poll it, or it enters the queue many times.
- `List<Integer>[] adj = new ArrayList[n]` compiles only with an unchecked warning. A `List<List<Integer>>` has no such problem.
- Recursive DFS thousands of levels deep throws `StackOverflowError`. Use an explicit stack or BFS on big inputs.
- In Dijkstra, `Integer.MAX_VALUE + w` wraps to a negative number. Relax only from polled distances, or store `long`.
