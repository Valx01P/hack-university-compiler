# Heaps and Priority Queues

JavaScript has no built-in heap. The sandbox, like LeetCode, has `@datastructures-js/priority-queue` (6.4.0 here): `MinPriorityQueue`, `MaxPriorityQueue`, and `PriorityQueue` with your own compare function. `front` peeks at the top and `dequeue` removes it, both in heap order, smallest first for a min-heap. Where no package is around, the small `MinHeap` class at the end does the same job.

### Min-heap

```javascript
const { MinPriorityQueue } = require("@datastructures-js/priority-queue");
const pq = new MinPriorityQueue();
pq.enqueue(5);
pq.enqueue(1);
pq.enqueue(3);
console.log(pq.front());    // 1, the smallest, still in the heap
console.log(pq.dequeue());  // 1, removed
console.log(pq.size());     // 2
console.log(pq.isEmpty());  // false
```

### Max-heap

```javascript
const { MaxPriorityQueue } = require("@datastructures-js/priority-queue");
const pq = new MaxPriorityQueue();
for (const x of [5, 1, 8]) pq.enqueue(x);
console.log(pq.dequeue());  // 8, the largest
console.log(pq.front());    // 5
```

### Objects by a priority callback

Pass a function that returns the number to order by.

```javascript
const { MinPriorityQueue, MaxPriorityQueue } = require("@datastructures-js/priority-queue");
const tasks = new MinPriorityQueue((task) => task.priority);
tasks.enqueue({ name: "write", priority: 2 });
tasks.enqueue({ name: "deploy", priority: 1 });
console.log(tasks.dequeue().name);  // deploy

const byDistance = new MinPriorityQueue(([x, y]) => x * x + y * y);  // a computed key
byDistance.enqueue([3, 3]);
byDistance.enqueue([1, -2]);
console.log(byDistance.front());    // [ 1, -2 ]

const richest = new MaxPriorityQueue((p) => p.cash);
richest.enqueue({ name: "ann", cash: 40 });
richest.enqueue({ name: "bob", cash: 90 });
console.log(richest.front().name);  // bob
```

### Pairs with a tie-break: a compare function

`PriorityQueue` takes a compare function like `sort` does: negative means `a` comes out first. Chain a tie-break with `||`.

```javascript
const { PriorityQueue } = require("@datastructures-js/priority-queue");
const pq = new PriorityQueue((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));  // count high to low, then word
pq.enqueue(["love", 2]);
pq.enqueue(["i", 2]);
pq.enqueue(["code", 1]);
while (!pq.isEmpty()) console.log(pq.dequeue().join(" "));  // i 2, then love 2, then code 1
```

### Build from an array: fromArray

`fromArray` heapifies in O(n), faster than n `enqueue` calls. It reorders the array you pass and keeps using it, so pass a copy when you need the original.

```javascript
const { MinPriorityQueue, MaxPriorityQueue, PriorityQueue } = require("@datastructures-js/priority-queue");
const stones = [2, 7, 4, 1, 8, 1];
const heap = MaxPriorityQueue.fromArray([...stones]);
while (heap.size() > 1) {
  const y = heap.dequeue();  // the heaviest
  const x = heap.dequeue();  // the next heaviest
  if (y !== x) heap.enqueue(y - x);
}
console.log(heap.isEmpty() ? 0 : heap.front());  // 1
console.log(stones.join(" "));                   // 2 7 4 1 8 1, untouched

const jobs = MinPriorityQueue.fromArray([{ id: "a", cost: 5 }, { id: "b", cost: 2 }], (j) => j.cost);
console.log(jobs.front().id);                    // b
const pairs = PriorityQueue.fromArray([[3, "c"], [1, "a"]], (a, b) => a[0] - b[0]);
console.log(pairs.front());                      // [ 1, 'a' ]
```

### Drain in order

```javascript
const { MinPriorityQueue } = require("@datastructures-js/priority-queue");
const pq = MinPriorityQueue.fromArray([5, 1, 8, 3]);
console.log(pq.toArray());  // [ 1, 3, 5, 8 ], a sorted copy, the heap keeps them
const out = [];
while (!pq.isEmpty()) out.push(pq.dequeue());
console.log(out.join(" "), pq.size());  // 1 3 5 8 0
```

### Kth largest: a min-heap kept at size k

```javascript
const { MinPriorityQueue } = require("@datastructures-js/priority-queue");
const nums = [3, 2, 1, 5, 6, 4];
const k = 2;
const top = new MinPriorityQueue();
for (const x of nums) {
  top.enqueue(x);
  if (top.size() > k) top.dequeue();  // drop the smallest, keep the k largest
}
console.log(top.front());  // 5, the 2nd largest
```

### Top k frequent words: a heap of map entries

The heap's top is the weakest entry kept: the lowest count, and on a tie the later word.

```javascript
const { PriorityQueue } = require("@datastructures-js/priority-queue");
const words = ["i", "love", "code", "i", "love", "js", "i"];
const counts = new Map();
for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
const k = 3;
const heap = new PriorityQueue((a, b) => a[1] - b[1] || b[0].localeCompare(a[0]));
for (const entry of counts) {  // each entry is [word, count]
  heap.enqueue(entry);
  if (heap.size() > k) heap.dequeue();
}
const best = [];
while (!heap.isEmpty()) best.push(heap.dequeue()[0]);
console.log(best.reverse().join(" "));  // i love code, strongest first
```

### Two heaps: running median

```javascript
const { MinPriorityQueue, MaxPriorityQueue } = require("@datastructures-js/priority-queue");
const low = new MaxPriorityQueue();   // the smaller half
const high = new MinPriorityQueue();  // the larger half
const medians = [];
for (const x of [5, 15, 1, 3]) {
  low.enqueue(x);
  high.enqueue(low.dequeue());        // the biggest of the low half moves up
  if (high.size() > low.size()) low.enqueue(high.dequeue());  // low keeps the extra one
  const median = low.size() > high.size() ? low.front() : (low.front() + high.front()) / 2;
  medians.push(median.toFixed(1));
}
console.log(medians.join(" "));  // 5.0 10.0 5.0 4.0
```

### Merge k sorted arrays

Each heap entry is `[value, which list, index in it]`.

```javascript
const { PriorityQueue } = require("@datastructures-js/priority-queue");
const lists = [[1, 4, 7], [2, 5], [0, 6, 9]];
const heap = new PriorityQueue((a, b) => a[0] - b[0]);
lists.forEach((list, i) => {
  if (list.length > 0) heap.enqueue([list[0], i, 0]);
});
const merged = [];
while (!heap.isEmpty()) {
  const [value, i, j] = heap.dequeue();
  merged.push(value);
  if (j + 1 < lists[i].length) heap.enqueue([lists[i][j + 1], i, j + 1]);
}
console.log(merged.join(" "));  // 0 1 2 4 5 6 7 9
```

### Without a package: a small MinHeap

An array where `a[i]`'s children sit at `2 * i + 1` and `2 * i + 2`. Pass a compare function, and flip it for a max-heap.

```javascript
class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.items = [];
    this.compare = compare;
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(x) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {  // sift up while smaller than the parent
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      while (true) {  // sift down toward the smaller child
        const l = 2 * i + 1;
        const r = l + 1;
        let small = i;
        if (l < a.length && this.compare(a[l], a[small]) < 0) small = l;
        if (r < a.length && this.compare(a[r], a[small]) < 0) small = r;
        if (small === i) break;
        [a[i], a[small]] = [a[small], a[i]];
        i = small;
      }
    }
    return top;
  }
}

const h = new MinHeap();
for (const x of [5, 1, 8, 3]) h.push(x);
console.log(h.pop(), h.pop(), h.peek(), h.size());  // 1 3 5 2
const maxHeap = new MinHeap((a, b) => b - a);
for (const x of [5, 1, 8]) maxHeap.push(x);
console.log(maxHeap.pop());                         // 8
```

### Costs

| Call | Cost |
| --- | --- |
| `enqueue(x)`, `dequeue()` | O(log n) |
| `front()`, `size()`, `isEmpty()` | O(1) |
| `fromArray(arr)` | O(n) |
| `toArray()` | O(n log n), a sorted copy |
| `contains(fn)`, `remove(fn)` | O(n), a scan |

### Gotchas

- `dequeue()` and `front()` return `null` on an empty queue instead of throwing. Check `isEmpty()` first.
- `fromArray(arr)` reorders `arr` itself and keeps it as the heap. Pass `[...arr]` to keep the original.
- The compare function must return a number. `(a, b) => a > b` returns a boolean and the order comes out wrong without an error.
- Older versions (5.x) took `{ priority }` options and returned `{ element, priority }` objects. In 6.x, as here, `dequeue()` returns your value itself.
