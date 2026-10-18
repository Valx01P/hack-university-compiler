# Standard Library

Beyond `vector`, `map`, and `set`, the standard library gives you ready-made stacks, queues, heaps, and a big set of algorithms that work on any range through iterators (`v.begin(), v.end()`). Include the header for each one. `std::optional` is in Infinity, NaN, and nullptr.

### Stack, queue, deque

```cpp
#include <stack>
#include <queue>
#include <deque>

std::stack<int> st;
st.push(1); st.push(2);
st.top();      // 2, last in
st.pop();      // removes it, returns nothing

std::queue<int> q;
q.push(1); q.push(2);
q.front();     // 1, first in
q.back();      // 2
q.pop();

std::deque<int> d = {2, 3};
d.push_front(1);   // {1, 2, 3}
d.push_back(4);    // {1, 2, 3, 4}
d.pop_front();     // {2, 3, 4}
d[0];              // 2, random access like a vector
```

### Priority queue (heap)

```cpp
#include <iostream>
#include <queue>
#include <vector>
#include <functional>

std::priority_queue<int> maxHeap;          // largest on top
for (int x : {5, 1, 8}) maxHeap.push(x);
maxHeap.top();                             // 8

std::priority_queue<int, std::vector<int>, std::greater<int>> minHeap;
for (int x : {5, 1, 8}) minHeap.push(x);
while (!minHeap.empty()) {
    std::cout << minHeap.top() << ' ';     // 1 5 8
    minHeap.pop();
}
```

### Algorithms

```cpp
#include <algorithm>
#include <functional>
#include <vector>

std::vector<int> v = {4, 1, 3, 1, 5};

std::sort(v.begin(), v.end());                      // {1, 1, 3, 4, 5}
std::sort(v.begin(), v.end(), std::greater<int>()); // {5, 4, 3, 1, 1}
std::reverse(v.begin(), v.end());                   // {1, 1, 3, 4, 5}

int ones = std::count(v.begin(), v.end(), 1);       // 2

auto it = std::find(v.begin(), v.end(), 3);
if (it != v.end()) {
    int index = it - v.begin();                      // 2
}

bool anyEven = std::any_of(v.begin(), v.end(), [](int x) { return x % 2 == 0; }); // true

auto lb = std::lower_bound(v.begin(), v.end(), 2);  // v is sorted: first element >= 2
int pos = lb - v.begin();                           // 2, where 2 would go
```

Sum, min, and max of a range (`std::accumulate`, `std::max_element`) are in Built-in Functions.

| Call | Does |
|---|---|
| `std::sort(b, e, cmp)` | sort, optional comparator |
| `std::stable_sort(b, e, cmp)` | sort, equal items keep their order |
| `std::reverse(b, e)` | reverse in place |
| `std::find(b, e, x)` / `std::find_if(b, e, f)` | iterator to the first match, or `e` |
| `std::count(b, e, x)` / `std::count_if(b, e, f)` | how many match |
| `std::iota(b, e, start)` | fill with start, start+1, ... (`<numeric>`) |
| `std::fill(b, e, x)` | set every element to `x` |
| `std::binary_search(b, e, x)` | true if `x` is in a sorted range |
| `std::lower_bound(b, e, x)` | first element >= `x` in a sorted range |
| `std::all_of` / `std::any_of` / `std::none_of` | test a predicate on every element |
| `std::next_permutation(b, e)` | next ordering, false after the last one |

### Remove duplicates and filter

```cpp
std::vector<int> v = {3, 1, 3, 2, 1};
std::sort(v.begin(), v.end());                       // {1, 1, 2, 3, 3}
v.erase(std::unique(v.begin(), v.end()), v.end());   // {1, 2, 3}

// erase-remove idiom: drop every even number
v.erase(std::remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }),
        v.end());                                    // {1, 3}
```

### Transform

```cpp
std::vector<int> v = {1, 2, 3};
std::vector<int> sq(v.size());
std::transform(v.begin(), v.end(), sq.begin(), [](int x) { return x * x; });
// sq = {1, 4, 9}
```

### Random numbers

```cpp
#include <random>

std::mt19937 rng(42);                          // fixed seed, same numbers every run
std::uniform_int_distribution<int> die(1, 6);  // inclusive range
for (int i = 0; i < 3; i++) {
    std::cout << die(rng) << ' ';
}
std::uniform_real_distribution<double> unit(0.0, 1.0);
double r = unit(rng);
// std::mt19937 rng(std::random_device{}()); for different numbers each run
```

### Timing code

```cpp
#include <chrono>

auto start = std::chrono::steady_clock::now();
// ... work ...
auto end = std::chrono::steady_clock::now();
auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
```

### Gotchas

- `pop()` on a stack, queue, or heap returns nothing. Read `top()` or `front()` first.
- `std::remove` and `std::unique` don't shrink the vector. Pair them with `erase`.
- `std::lower_bound` and `std::binary_search` need a sorted range. On unsorted data they give wrong answers silently.
- `std::priority_queue` is a max-heap by default. Use `std::greater<int>` for a min-heap.
