# Heaps and Priority Queues

`std::priority_queue` from `<queue>` is a binary heap stored in a vector. The one thing to know first: it's a **max heap**, so `top()` is the largest. Pass `std::greater<>` for a min heap. `push` and `pop` are O(log n), `top` is O(1), and only the top is visible.

### Max heap

```cpp
#include <queue>
#include <vector>

std::priority_queue<int> pq;
pq.push(5);
pq.push(1);
pq.push(8);
std::cout << pq.top() << '\n';    // 8, the largest
pq.pop();                         // removes it, returns void
std::cout << pq.top() << ' ' << pq.size() << ' ' << pq.empty() << '\n';   // 5 2 0
```

### Min heap with std::greater

The full type names the element, the container, and the comparator.

```cpp
#include <functional>   // std::greater

std::priority_queue<int, std::vector<int>, std::greater<int>> minHeap;
for (int x : {5, 1, 8, 3}) minHeap.push(x);
while (!minHeap.empty()) {
    std::cout << minHeap.top() << ' ';   // 1 3 5 8, drained in order
    minHeap.pop();
}
```

### Build one from a range

The constructor that takes two iterators heapifies the whole range at once, in O(n).

```cpp
std::vector<int> stones = {2, 7, 4, 1, 8, 1};
std::priority_queue<int> heap(stones.begin(), stones.end());
std::cout << heap.top() << '\n';                  // 8
std::priority_queue<int, std::vector<int>, std::greater<int>> low(stones.begin(), stones.end());
std::cout << low.top() << '\n';                   // 1

while (heap.size() > 1) {                         // last stone weight
    int y = heap.top();
    heap.pop();
    int x = heap.top();
    heap.pop();
    if (y != x) heap.push(y - x);
}
std::cout << (heap.empty() ? 0 : heap.top()) << '\n';   // 1
```

### A heap of pairs

Pairs compare by `first`, then `second`, so `(distance, node)` pairs come out by distance. Copy the top with plain `auto` before popping.

```cpp
#include <utility>

using Item = std::pair<int, int>;   // {distance, node}
std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
pq.push({4, 1});
pq.push({1, 2});
pq.push({1, 0});
auto [dist, node] = pq.top();       // a copy, safe after pop
pq.pop();
std::cout << dist << ' ' << node << '\n';    // 1 0, ties broken by node
std::cout << pq.top().second << '\n';        // 2
```

### A key and a tie-break: a comparator struct

The comparator answers "does `a` sit below `b`?". It returns `true` when `a` comes out **after** `b`, which is the reverse of a sort comparator. K closest points to the origin: by squared distance, then x, then y.

```cpp
#include <array>

struct Farther {
    bool operator()(const std::array<int, 2>& a, const std::array<int, 2>& b) const {
        long long da = 1LL * a[0] * a[0] + 1LL * a[1] * a[1];
        long long db = 1LL * b[0] * b[0] + 1LL * b[1] * b[1];
        if (da != db) return da > db;   // farther sits lower, so the closest is on top
        if (a[0] != b[0]) return a[0] > b[0];
        return a[1] > b[1];
    }
};

std::vector<std::array<int, 2>> points = {{3, 3}, {-2, 2}, {1, -3}, {2, -2}, {5, -1}};
std::priority_queue<std::array<int, 2>, std::vector<std::array<int, 2>>, Farther> pq(points.begin(), points.end());
for (int i = 0; i < 3; i++) {
    auto p = pq.top();
    pq.pop();
    std::cout << p[0] << ',' << p[1] << ' ';   // -2,2 2,-2 1,-3
}
```

### A lambda with decltype

```cpp
#include <string>

auto cmp = [](const std::pair<int, std::string>& a, const std::pair<int, std::string>& b) {
    if (a.first != b.first) return a.first < b.first;   // higher count on top
    return a.second > b.second;                         // ties: earlier word on top
};
std::priority_queue<std::pair<int, std::string>, std::vector<std::pair<int, std::string>>, decltype(cmp)> pq(cmp);
pq.push({2, "love"});
pq.push({3, "i"});
pq.push({2, "code"});
while (!pq.empty()) {
    std::cout << pq.top().second << ' ';   // i code love
    pq.pop();
}
```

In C++17 the lambda must be passed to the constructor, `pq(cmp)`. A lambda type has no default constructor until C++20.

### Top k: a min heap kept at size k

```cpp
std::vector<int> nums = {3, 2, 1, 5, 6, 4};
int k = 2;
std::priority_queue<int, std::vector<int>, std::greater<int>> top;
for (int x : nums) {
    top.push(x);
    if (static_cast<int>(top.size()) > k) top.pop();   // drop the smallest, keep the k largest
}
std::cout << top.top() << '\n';   // 5, the 2nd largest
```

O(n log k). For top k frequent words, count in a map, push `(count, word)` pairs with a comparator whose weakest entry is on top, and pop when the size passes k.

### Two heaps: running median

```cpp
#include <iomanip>

std::priority_queue<int> low;                                       // smaller half, max on top
std::priority_queue<int, std::vector<int>, std::greater<int>> high; // larger half, min on top
std::cout << std::fixed << std::setprecision(1);
for (int x : {5, 15, 1, 3}) {
    low.push(x);
    high.push(low.top());               // the biggest of the low half moves up
    low.pop();
    if (high.size() > low.size()) {     // low keeps the extra one
        low.push(high.top());
        high.pop();
    }
    double median = low.size() > high.size() ? low.top() : (low.top() + high.top()) / 2.0;
    std::cout << median << ' ';         // 5.0 10.0 5.0 4.0
}
```

### Merge k sorted lists

Each heap entry is `{value, which list, index in it}`. A `std::tuple` compares item by item like a pair.

```cpp
#include <tuple>

std::vector<std::vector<int>> lists = {{1, 4, 7}, {2, 5}, {0, 6, 9}};
using Entry = std::tuple<int, int, int>;
std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> heap;
for (int i = 0; i < static_cast<int>(lists.size()); i++) {
    if (!lists[i].empty()) heap.push({lists[i][0], i, 0});
}
std::vector<int> merged;
while (!heap.empty()) {
    auto [value, li, at] = heap.top();
    heap.pop();
    merged.push_back(value);
    if (at + 1 < static_cast<int>(lists[li].size())) heap.push({lists[li][at + 1], li, at + 1});
}
for (int x : merged) std::cout << x << ' ';   // 0 1 2 4 5 6 7 9
```

### A heap inside a vector: make_heap, push_heap, pop_heap

`<algorithm>` runs the same max heap on a plain vector you can still loop over.

```cpp
#include <algorithm>

std::vector<int> h = {3, 1, 4, 1, 5};
std::make_heap(h.begin(), h.end());   // O(n), h.front() is the largest
std::cout << h.front() << '\n';       // 5
h.push_back(9);
std::push_heap(h.begin(), h.end());   // sift the new last item up
std::cout << h.front() << '\n';       // 9
std::pop_heap(h.begin(), h.end());    // moves the largest to the back
std::cout << h.back() << '\n';        // 9
h.pop_back();                         // now remove it
std::cout << h.front() << '\n';       // 5
```

### Costs

| Call | Cost |
|---|---|
| `push(x)`, `pop()` | O(log n) |
| `top()`, `size()`, `empty()` | O(1) |
| `priority_queue pq(b, e)` | O(n) |
| `std::make_heap(b, e)` | O(n) |
| `std::push_heap`, `std::pop_heap` | O(log n) |

### Gotchas

- `std::priority_queue<int>` is a max heap. Forgetting `std::greater<int>` for a min heap is the classic bug.
- The comparator is reversed from `std::sort`'s: `a > b` puts the smallest on top. Think "returns true when `a` sits below `b`".
- `top()` and `pop()` on an empty heap are undefined behavior. Check `empty()` first, and copy the top with `auto`, never `const auto&`, before you pop.
- A priority queue has no iterators and no `find` or `erase`. To skip items that went stale, pop them and check (like Dijkstra's `if (d > dist[u]) continue;`).
