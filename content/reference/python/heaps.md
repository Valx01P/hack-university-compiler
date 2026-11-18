# Heaps and Priority Queues

`heapq` keeps a plain list as a min heap: `heap[0]` is always the smallest item, and a push or a pop costs O(log n). There's no heap class and no max heap. You pass the list to every call, and for a max heap you push negated numbers.

### Min heap: push, pop, peek

```python
import heapq

heap = []
heapq.heappush(heap, 5)
heapq.heappush(heap, 1)
heapq.heappush(heap, 3)
print(heap[0])                 # 1  peek, still in the heap
print(heapq.heappop(heap))     # 1  removed
print(len(heap))               # 2
print(bool(heap))              # True  not empty
```

### Build from a list: heapify

```python
import heapq

nums = [5, 1, 8, 3, 2]
heapq.heapify(nums)            # in place, O(n), returns None
print(nums[0])                 # 1
print(nums)                    # [1, 2, 8, 3, 5]  heap order, not sorted
print([heapq.heappop(nums) for _ in range(len(nums))])   # [1, 2, 3, 5, 8]
```

### Max heap: negate on the way in and out

```python
import heapq

stones = [2, 7, 4, 1, 8, 1]
heap = [-s for s in stones]
heapq.heapify(heap)
print(-heap[0])                # 8  the largest
while len(heap) > 1:
    y = -heapq.heappop(heap)   # the heaviest
    x = -heapq.heappop(heap)   # the next heaviest
    if y != x:
        heapq.heappush(heap, -(y - x))
print(-heap[0] if heap else 0) # 1
```

Python 3.14 adds `heappush_max` and friends, which aren't available here.

### Push and pop in one call

```python
import heapq

heap = [2, 5, 9]
print(heapq.heappushpop(heap, 1))   # 1  push first, then pop: 1 never stays
print(heapq.heappushpop(heap, 7))   # 2
print(heap)                         # [5, 7, 9]
print(heapq.heapreplace(heap, 1))   # 5  pop first, then push
print(heap)                         # [1, 7, 9]
```

### Top k: nlargest and nsmallest

```python
import heapq

scores = [72, 95, 88, 61, 95, 79]
print(heapq.nlargest(3, scores))             # [95, 95, 88]
print(heapq.nsmallest(2, scores))            # [61, 72]
words = ["kiwi", "fig", "banana", "pear"]
print(heapq.nsmallest(2, words, key=len))    # ['fig', 'kiwi']
```

### Kth largest: a min heap kept at size k

```python
import heapq

nums, k = [3, 2, 1, 5, 6, 4], 2
top = []
for x in nums:
    heapq.heappush(top, x)
    if len(top) > k:
        heapq.heappop(top)       # drop the smallest, the k largest stay
print(top[0])                    # 5  the kth largest
```

### Tuples: a key, then a tie-break

Tuples compare item by item, so `(priority, name)` orders by priority, then by name.

```python
import heapq

tasks = []
heapq.heappush(tasks, (2, "write"))
heapq.heappush(tasks, (1, "plan"))
heapq.heappush(tasks, (2, "deploy"))
while tasks:
    priority, name = heapq.heappop(tasks)
    print(priority, name)        # 1 plan, 2 deploy, 2 write
```

K closest points: the key is the squared distance, then x, then y.

```python
import heapq

points = [(3, 3), (-2, 2), (1, -3), (2, -2), (5, -1)]
heap = [(x * x + y * y, x, y) for x, y in points]
heapq.heapify(heap)
print([heapq.heappop(heap)[1:] for _ in range(3)])   # [(-2, 2), (2, -2), (1, -3)]
print(heapq.nsmallest(3, points, key=lambda p: (p[0] ** 2 + p[1] ** 2, p)))   # the same three
```

### Top k frequent: counts in a heap

Most frequent first, ties alphabetical: negate the count and keep the word as it is.

```python
import heapq
from collections import Counter

words = ["i", "love", "code", "i", "love", "py", "i"]
counts = Counter(words)
heap = [(-n, w) for w, n in counts.items()]
heapq.heapify(heap)
print([heapq.heappop(heap)[1] for _ in range(3)])   # ['i', 'love', 'code']
print(heapq.nsmallest(3, counts, key=lambda w: (-counts[w], w)))   # ['i', 'love', 'code']
```

### Objects: a counter so they're never compared

When two priorities tie, the heap compares the next item. Objects without `<` raise `TypeError`:

```python error
import heapq

class Job:
    pass

heap = []
heapq.heappush(heap, (2, Job()))
heapq.heappush(heap, (2, Job()))   # TypeError: '<' not supported between instances of 'Job' and 'Job'
```

Put an increasing number between the priority and the object. It never ties, and equal priorities come out in the order they went in.

```python
import heapq
from itertools import count

class Job:
    def __init__(self, name):
        self.name = name

order = count()                    # 0, 1, 2, ...
heap = []
for priority, name in [(2, "b"), (1, "a"), (2, "c")]:
    heapq.heappush(heap, (priority, next(order), Job(name)))
while heap:
    priority, _, job = heapq.heappop(heap)
    print(priority, job.name)      # 1 a, 2 b, 2 c
```

Or give the class a `__lt__`, and the heap compares objects directly:

```python
import heapq

class Task:
    def __init__(self, name, cost):
        self.name, self.cost = name, cost

    def __lt__(self, other):
        return self.cost < other.cost

heap = [Task("x", 3), Task("y", 1)]
heapq.heapify(heap)
print(heapq.heappop(heap).name)    # y
```

### Merge k sorted lists

Each entry is `(value, which list, index in it)`. The list number also breaks ties.

```python
import heapq

lists = [[1, 4, 7], [2, 5], [0, 6, 9]]
heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
heapq.heapify(heap)
merged = []
while heap:
    val, i, j = heapq.heappop(heap)
    merged.append(val)
    if j + 1 < len(lists[i]):
        heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
print(merged)                      # [0, 1, 2, 4, 5, 6, 7, 9]
print(list(heapq.merge(*lists)))   # [0, 1, 2, 4, 5, 6, 7, 9]  the built-in
```

### Two heaps: running median

`low` is a max heap (negated) of the smaller half, and `high` a min heap of the larger half. `low` keeps the extra item when the count is odd.

```python
import heapq

low, high = [], []
for x in [5, 15, 1, 3]:
    heapq.heappush(low, -x)
    heapq.heappush(high, -heapq.heappop(low))     # the biggest of low moves up
    if len(high) > len(low):
        heapq.heappush(low, -heapq.heappop(high))
    median = -low[0] if len(low) > len(high) else (-low[0] + high[0]) / 2
    print(f"{median:.1f}")         # 5.0, 10.0, 5.0, 4.0
```

### Costs

| Call | Cost |
| --- | --- |
| `heappush`, `heappop`, `heappushpop`, `heapreplace` | O(log n) |
| `heap[0]`, `len(heap)` | O(1) |
| `heapify(xs)` | O(n) |
| `nlargest(k, xs)`, `nsmallest(k, xs)` | O(n log k) |
| `x in heap`, `heap.remove(x)` | O(n), a scan |

### Gotchas

- `heapq` has no max heap. Negate numbers on the way in and out. Strings can't be negated, so for "largest string first" use `nlargest` or `nsmallest` with a `key=`, or wrap each item in a class whose `__lt__` is reversed.
- Printing a heap shows heap order, not sorted order. Only repeated `heappop` comes out sorted.
- `heappop([])` raises `IndexError`. Loop with `while heap:`.
- Change the list only with `heapq` calls. A plain `append` skips the reordering, so `heap[0]` may stop being the smallest.
