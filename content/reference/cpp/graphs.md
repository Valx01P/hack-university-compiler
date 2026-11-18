# Graphs

Number the nodes 0 to n - 1 and keep an adjacency list, `std::vector<std::vector<int>> adj(n)`, with one neighbor list per node. BFS finds the fewest edges, DFS explores, Kahn's algorithm orders tasks, union find groups nodes, and Dijkstra finds the cheapest weighted route. BFS, DFS, and Kahn's take O(V + E), and Dijkstra O(E log V).

### Adjacency list and BFS (fewest edges)

```cpp
#include <queue>
#include <vector>

int n = 5;
std::vector<std::vector<int>> edges = {{0, 1}, {0, 2}, {1, 3}};
std::vector<std::vector<int>> adj(n);
for (const auto& e : edges) {
    adj[e[0]].push_back(e[1]);
    adj[e[1]].push_back(e[0]);         // undirected: both ways, directed: only the line above
}
std::cout << adj[0].size() << '\n';    // 2, the degree of node 0

std::vector<int> dist(n, -1);          // -1: not reached yet
std::queue<int> q;
dist[0] = 0;
q.push(0);
while (!q.empty()) {
    int u = q.front();
    q.pop();
    for (int v : adj[u]) {
        if (dist[v] == -1) {           // mark when you push, not when you pop
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }
}
for (int d : dist) std::cout << d << ' ';   // 0 1 1 2 -1, node 4 is unreachable
```

For labels that aren't 0 to n - 1, use `std::unordered_map<std::string, std::vector<std::string>> graph` and add with `graph[u].push_back(v)`.

### DFS: by recursion and by a stack

```cpp harness
int n = 5;
std::vector<std::vector<int>> adj = {{1, 2}, {0, 3}, {0}, {1}, {}};
{{code}}
```

```cpp
#include <functional>   // std::function, for a recursive lambda
#include <stack>

std::vector<bool> seen(n, false);
std::function<void(int)> dfs = [&](int u) {
    seen[u] = true;                    // mark first
    std::cout << u << ' ';             // 0 1 3 2
    for (int v : adj[u]) {
        if (!seen[v]) dfs(v);
    }
};
dfs(0);
std::cout << '\n';

int components = 0;
std::vector<bool> visited(n, false);
for (int start = 0; start < n; start++) {
    if (visited[start]) continue;
    components++;                      // each new start is one component
    std::stack<int> st;
    st.push(start);
    visited[start] = true;
    while (!st.empty()) {
        int u = st.top();
        st.pop();
        for (int v : adj[u]) {
            if (!visited[v]) {
                visited[v] = true;
                st.push(v);
            }
        }
    }
}
std::cout << components << '\n';       // 2, {0 1 2 3} and {4}
```

A plain function works too: `void dfs(int u, const std::vector<std::vector<int>>& adj, std::vector<bool>& seen)`.

### Grids with direction arrays: islands by DFS

```cpp
#include <string>

void sink(std::vector<std::string>& grid, int r, int c) {
    const int dr[] = {-1, 1, 0, 0};    // up, down, left, right
    const int dc[] = {0, 0, -1, 1};
    if (r < 0 || r >= static_cast<int>(grid.size()) || c < 0 || c >= static_cast<int>(grid[0].size())) return;
    if (grid[r][c] != '1') return;     // water, or already visited
    grid[r][c] = '0';                  // mark before recursing
    for (int d = 0; d < 4; d++) sink(grid, r + dr[d], c + dc[d]);
}

std::vector<std::string> grid = {"11000", "11010", "00011"};
int islands = 0;
for (int r = 0; r < static_cast<int>(grid.size()); r++) {
    for (int c = 0; c < static_cast<int>(grid[0].size()); c++) {
        if (grid[r][c] == '1') {
            islands++;
            sink(grid, r, c);
        }
    }
}
std::cout << islands << '\n';          // 2
```

### Grids by BFS: levels from many sources at once

Rotting oranges: every rotten cell (2) starts in the queue, and each level of the BFS is one minute.

```cpp
#include <utility>

std::vector<std::vector<int>> g = {{2, 1, 1}, {1, 1, 0}, {0, 1, 1}};
int R = static_cast<int>(g.size()), C = static_cast<int>(g[0].size());
const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
std::queue<std::pair<int, int>> q;
int fresh = 0;
for (int r = 0; r < R; r++) {
    for (int c = 0; c < C; c++) {
        if (g[r][c] == 2) q.push({r, c});
        else if (g[r][c] == 1) fresh++;
    }
}
int minutes = 0;
while (!q.empty() && fresh > 0) {
    for (int size = static_cast<int>(q.size()); size > 0; size--) {   // only this level
        auto [r, c] = q.front();
        q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr >= 0 && nr < R && nc >= 0 && nc < C && g[nr][nc] == 1) {
                g[nr][nc] = 2;
                fresh--;
                q.push({nr, nc});
            }
        }
    }
    minutes++;
}
std::cout << (fresh == 0 ? minutes : -1) << '\n';   // 4
```

### Topological sort (Kahn's algorithm)

```cpp
int n = 4;
std::vector<std::vector<int>> prereqs = {{1, 0}, {2, 0}, {3, 1}, {3, 2}};   // {course, the one it needs first}
std::vector<std::vector<int>> after(n);
std::vector<int> indegree(n, 0);
for (const auto& p : prereqs) {
    after[p[1]].push_back(p[0]);
    indegree[p[0]]++;
}
std::queue<int> ready;
for (int i = 0; i < n; i++) {
    if (indegree[i] == 0) ready.push(i);   // waits for nothing
}
std::vector<int> order;
while (!ready.empty()) {
    int u = ready.front();
    ready.pop();
    order.push_back(u);
    for (int v : after[u]) {
        if (--indegree[v] == 0) ready.push(v);
    }
}
for (int x : order) std::cout << x << ' ';   // 0 1 2 3
std::cout << '\n' << std::boolalpha << (static_cast<int>(order.size()) == n) << '\n';   // true, false means a cycle
```

### Union find

```cpp
#include <numeric>   // std::iota

struct UnionFind {
    std::vector<int> parent, size;
    int groups;
    explicit UnionFind(int n) : parent(n), size(n, 1), groups(n) {
        std::iota(parent.begin(), parent.end(), 0);   // each node starts alone
    }
    int find(int x) {
        if (parent[x] != x) parent[x] = find(parent[x]);   // path compression
        return parent[x];
    }
    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;                     // already one group
        if (size[a] < size[b]) std::swap(a, b);       // hang the smaller under the larger
        parent[b] = a;
        size[a] += size[b];
        groups--;
        return true;
    }
};

UnionFind uf(5);
uf.unite(0, 1);
uf.unite(1, 2);
uf.unite(3, 4);
std::cout << uf.groups << '\n';                                  // 2
std::cout << std::boolalpha << (uf.find(0) == uf.find(2)) << '\n';  // true
std::cout << uf.unite(2, 0) << '\n';                             // false, it would close a cycle
```

`union` is a C++ keyword, so the method is `unite`.

### Dijkstra with a priority_queue of pairs

```cpp
#include <climits>
#include <functional>

int n = 4;
std::vector<std::vector<int>> times = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 5}};   // {from, to, weight}
std::vector<std::vector<std::pair<int, int>>> g(n);                                  // {to, weight}
for (const auto& t : times) g[t[0]].push_back({t[1], t[2]});

const long long INF = LLONG_MAX;
std::vector<long long> dist(n, INF);
using Item = std::pair<long long, int>;                                              // {distance, node}
std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
dist[0] = 0;
pq.push({0, 0});
while (!pq.empty()) {
    auto [d, u] = pq.top();
    pq.pop();
    if (d > dist[u]) continue;         // stale: a shorter route was found later
    for (auto [v, w] : g[u]) {
        if (dist[u] + w < dist[v]) {
            dist[v] = dist[u] + w;
            pq.push({dist[v], v});
        }
    }
}
for (long long d : dist) std::cout << d << ' ';   // 0 3 1 8
long long worst = *std::max_element(dist.begin(), dist.end());
std::cout << '\n' << (worst == INF ? -1 : worst) << '\n';   // 8, the time for every node to hear (network delay)
```

### Gotchas

- Mark a node visited when you push it, not when you pop it, or it enters the queue many times.
- Recursive DFS over a 1000 by 1000 grid can go a million calls deep and overflow the stack. Use BFS or an explicit stack there.
- `std::vector<bool>` packs bits, so `auto& b = seen[i]` doesn't compile. Index it directly, or use `std::vector<char>`.
- In Dijkstra, keep distances in `long long` and never add to `INF`. Relax only from a popped node whose distance is real.
