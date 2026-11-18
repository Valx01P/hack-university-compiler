# Heaps and Priority Queues

`PriorityQueue` is a binary min-heap: `peek` and `poll` give the smallest element, by natural order or by the comparator you pass. Pass `Collections.reverseOrder()` for a max-heap. It isn't sorted inside, so only repeated `poll` comes out in order.

### Min-heap

```java
import java.util.PriorityQueue;

PriorityQueue<Integer> pq = new PriorityQueue<>();
pq.offer(5);
pq.offer(1);
pq.add(3);                         // same as offer
System.out.println(pq.peek());     // 1, the smallest, still in the heap
System.out.println(pq.poll());     // 1, removed
System.out.println(pq.size());     // 2
System.out.println(pq.isEmpty());  // false
```

### Max-heap

```java
import java.util.Collections;
import java.util.Comparator;

PriorityQueue<Integer> max1 = new PriorityQueue<>(Collections.reverseOrder());
PriorityQueue<Integer> max2 = new PriorityQueue<>(Comparator.reverseOrder());
PriorityQueue<Integer> max3 = new PriorityQueue<>((a, b) -> Integer.compare(b, a));
for (int x : new int[]{5, 1, 8}) {
    max1.offer(x);
    max2.offer(x);
    max3.offer(x);
}
System.out.println(max1.poll() + " " + max2.poll() + " " + max3.poll()); // 8 8 8
```

### Build from a list: the constructor and addAll

`new PriorityQueue<>(list)` builds a min-heap from the whole list in O(n). It takes no comparator, so for a max-heap start empty and call `addAll`.

```java
import java.util.ArrayList;
import java.util.List;

List<Integer> stones = List.of(2, 7, 4, 1, 8, 1);
PriorityQueue<Integer> minHeap = new PriorityQueue<>(stones);
System.out.println(minHeap.peek());  // 1

PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
maxHeap.addAll(stones);
System.out.println(maxHeap.peek());  // 8

int[] more = {3, 9};
for (int x : more) {
    maxHeap.offer(x);                // an int[] can't go to addAll, offer each value
}
System.out.println(maxHeap.peek());  // 9
System.out.println(maxHeap.size());  // 8
```

### Pop two, push back (last stone weight)

```java
PriorityQueue<Integer> heap = new PriorityQueue<>(Collections.reverseOrder());
heap.addAll(List.of(2, 7, 4, 1, 8, 1));
while (heap.size() > 1) {
    int y = heap.poll();             // heaviest
    int x = heap.poll();             // next heaviest
    if (y != x) {
        heap.offer(y - x);
    }
}
System.out.println(heap.isEmpty() ? 0 : heap.peek()); // 1
```

### Drain in sorted order

```java
PriorityQueue<Integer> pq = new PriorityQueue<>(List.of(5, 1, 8, 3, 2));
System.out.println(pq);                   // [1, 2, 8, 3, 5], heap order, not sorted
StringBuilder sb = new StringBuilder();
while (!pq.isEmpty()) {
    sb.append(pq.poll()).append(' ');
}
System.out.println(sb.toString().trim()); // 1 2 3 5 8
```

### A heap of int[] by a key, with a tie-break

The k closest points to the origin: by squared distance, then by x, then by y.

```java
int[][] points = {{3, 3}, {-2, 2}, {1, -3}, {2, -2}, {5, -1}};
PriorityQueue<int[]> byDist = new PriorityQueue<>((a, b) -> {
    int da = a[0] * a[0] + a[1] * a[1];
    int db = b[0] * b[0] + b[1] * b[1];
    if (da != db) {
        return Integer.compare(da, db);     // closer first
    }
    if (a[0] != b[0]) {
        return Integer.compare(a[0], b[0]); // then smaller x
    }
    return Integer.compare(a[1], b[1]);     // then smaller y
});
for (int[] p : points) {
    byDist.offer(p);
}
for (int i = 0; i < 3; i++) {
    int[] p = byDist.poll();
    System.out.println(p[0] + " " + p[1]);  // -2 2, then 2 -2, then 1 -3
}

PriorityQueue<int[]> byFirst = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
byFirst.offer(new int[]{4, 0});
byFirst.offer(new int[]{2, 1});
System.out.println(byFirst.peek()[0]);      // 2
```

### A heap of objects

```java
class Task {
    String name;
    int priority;
    Task(String name, int priority) {
        this.name = name;
        this.priority = priority;
    }
}

PriorityQueue<Task> tasks = new PriorityQueue<>(
        Comparator.comparingInt((Task t) -> t.priority).thenComparing(t -> t.name));
tasks.offer(new Task("write", 2));
tasks.offer(new Task("deploy", 1));
tasks.offer(new Task("review", 2));
while (!tasks.isEmpty()) {
    Task t = tasks.poll();
    System.out.println(t.priority + " " + t.name); // 1 deploy, 2 review, 2 write
}
```

### Kth largest: a min-heap kept at size k

```java
int[] nums = {3, 2, 1, 5, 6, 4};
int k = 2;
PriorityQueue<Integer> top = new PriorityQueue<>();
for (int x : nums) {
    top.offer(x);
    if (top.size() > k) {
        top.poll();                  // drop the smallest, keep the k largest
    }
}
System.out.println(top.peek());      // 5, the 2nd largest
```

### Top k frequent words: a heap of map entries

The heap's top is the weakest entry kept: the lowest count, and for a tie the later word.

```java
import java.util.HashMap;
import java.util.Map;

String[] words = {"i", "love", "code", "i", "love", "java", "i"};
Map<String, Integer> counts = new HashMap<>();
for (String w : words) {
    counts.merge(w, 1, Integer::sum);
}
int k = 3;
PriorityQueue<Map.Entry<String, Integer>> heap = new PriorityQueue<>((a, b) -> {
    if (!a.getValue().equals(b.getValue())) {
        return Integer.compare(a.getValue(), b.getValue()); // lower count on top
    }
    return b.getKey().compareTo(a.getKey());                // later word on top
});
for (Map.Entry<String, Integer> e : counts.entrySet()) {
    heap.offer(e);
    if (heap.size() > k) {
        heap.poll();
    }
}
List<String> best = new ArrayList<>();
while (!heap.isEmpty()) {
    best.add(heap.poll().getKey());
}
Collections.reverse(best);                                  // strongest first
System.out.println(best); // [i, love, code]
```

### Two heaps: running median

```java
PriorityQueue<Integer> low = new PriorityQueue<>(Collections.reverseOrder()); // smaller half
PriorityQueue<Integer> high = new PriorityQueue<>();                          // larger half
for (int x : new int[]{5, 15, 1, 3}) {
    low.offer(x);
    high.offer(low.poll());          // the biggest of the low half moves up
    if (high.size() > low.size()) {
        low.offer(high.poll());      // low keeps the extra one
    }
    double median = low.size() > high.size() ? low.peek() : (low.peek() + high.peek()) / 2.0;
    System.out.printf("%.1f%n", median); // 5.0, 10.0, 5.0, 4.0
}
```

### Merge k sorted arrays

Each heap entry is `{value, which array, index in it}`.

```java
int[][] lists = {{1, 4, 7}, {2, 5}, {0, 6, 9}};
PriorityQueue<int[]> heap = new PriorityQueue<>(Comparator.comparingInt(e -> e[0]));
for (int i = 0; i < lists.length; i++) {
    if (lists[i].length > 0) {
        heap.offer(new int[]{lists[i][0], i, 0});
    }
}
List<Integer> merged = new ArrayList<>();
while (!heap.isEmpty()) {
    int[] e = heap.poll();
    merged.add(e[0]);
    int next = e[2] + 1;
    if (next < lists[e[1]].length) {
        heap.offer(new int[]{lists[e[1]][next], e[1], next});
    }
}
System.out.println(merged); // [0, 1, 2, 4, 5, 6, 7, 9]
```

### Costs

| Call | Cost |
| --- | --- |
| `offer(x)`, `add(x)`, `poll()` | O(log n) |
| `peek()`, `size()`, `isEmpty()` | O(1) |
| `new PriorityQueue<>(collection)` | O(n) |
| `addAll(collection)` | O(k log n), one `offer` per item |
| `remove(x)`, `contains(x)` | O(n), a scan |

### Gotchas

- Printing a `PriorityQueue` or a for-each over it shows heap order, not sorted order. Only `poll` in a loop comes out sorted.
- Compare with `Integer.compare(a, b)`, never `a - b`. It overflows when values are far apart, and the heap breaks without an error.
- `poll()` and `peek()` return `null` when the heap is empty, so `int top = pq.poll();` throws `NullPointerException`. Check `isEmpty()` first.
- `low.peek() == high.peek()` compares two `Integer` objects and fails above 127. Use `equals`, or store them in `int` variables.
