# Typed Heaps and Priority Queues

Node has no heap, and the runner has no packages, so a heap is the small `Heap<T>` class below, the same one the challenge starters carry. Its compare function works like `sort`'s: `compare(a, b) < 0` means `a` comes out first, so `(a, b) => a - b` is a min heap and `(a, b) => b - a` a max heap. `peek()` and `pop()` return `T | undefined`, and `undefined` means the heap is empty.

### The Heap<T> class

An array where `items[i]`'s children sit at `2 * i + 1` and `2 * i + 2`, and the top is `items[0]`. A list as the second argument heapifies a copy of it in O(n), faster than n `push` calls, and leaves your array alone.

```typescript
// A small binary heap. compare(a, b) < 0 means a comes out first, so
// (a, b) => a - b makes a min heap and (a, b) => b - a a max heap.
class Heap<T> {
  private items: T[];
  private compare: (a: T, b: T) => number;

  // Starts empty, or builds the heap from a whole list at once.
  constructor(compare: (a: T, b: T) => number, items: T[] = []) {
    this.compare = compare;
    this.items = [...items];
    for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0 && this.before(i, Math.floor((i - 1) / 2))) {
      this.swap(i, Math.floor((i - 1) / 2));
      i = Math.floor((i - 1) / 2);
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private before(i: number, j: number): boolean {
    const a = this.items[i];
    const b = this.items[j];
    return a !== undefined && b !== undefined && this.compare(a, b) < 0;
  }

  private swap(i: number, j: number): void {
    const a = this.items[i];
    const b = this.items[j];
    if (a !== undefined && b !== undefined) {
      this.items[i] = b;
      this.items[j] = a;
    }
  }

  private siftDown(i: number): void {
    for (;;) {
      let best = i;
      for (const child of [2 * i + 1, 2 * i + 2]) {
        if (this.before(child, best)) {
          best = child;
        }
      }
      if (best === i) {
        return;
      }
      this.swap(i, best);
      i = best;
    }
  }
}

const heap = new Heap<number>((a, b) => a - b);  // a min heap
for (const x of [5, 1, 8, 3]) heap.push(x);
console.log(heap.peek(), heap.size());  // 1 4, the smallest, still in the heap
console.log(heap.pop(), heap.pop());    // 1 3
const rest: number[] = [];
for (let x = heap.pop(); x !== undefined; x = heap.pop()) rest.push(x);  // drain in order
console.log(rest, heap.size(), heap.pop());  // [ 5, 8 ] 0 undefined

const stones = [2, 7, 4, 1, 8, 1];
const heavy = new Heap<number>((a, b) => b - a, stones);  // a max heap, built from the list
while (heavy.size() > 1) {
  const y = heavy.pop() ?? 0;  // the heaviest (size() > 1, so never the 0)
  const x = heavy.pop() ?? 0;  // the next heaviest
  if (y !== x) heavy.push(y - x);
}
console.log(heavy.peek() ?? 0);  // 1
console.log(stones.join(" "));   // 2 7 4 1 8 1, untouched
```

### Objects, tuples, and a tie-break

The type argument says what the heap holds, and the compare function orders it by any key. Chain a tie-break with `||`.

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
type Task = { name: string; priority: number };
const tasks = new Heap<Task>((a, b) => a.priority - b.priority);
tasks.push({ name: "write", priority: 2 });
tasks.push({ name: "deploy", priority: 1 });
console.log(tasks.pop()?.name);  // deploy

type Point = [x: number, y: number];
const dist2 = ([x, y]: Point): number => x * x + y * y;
const near = new Heap<Point>((p, q) => dist2(p) - dist2(q), [[3, 3], [1, -2], [-2, 2]]);  // a computed key
console.log(near.peek());        // [ 1, -2 ]

type WordCount = [word: string, count: number];
const byCount = new Heap<WordCount>(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),  // count high to low, then word
  [["love", 2], ["i", 2], ["code", 1]],
);
for (let e = byCount.pop(); e !== undefined; e = byCount.pop()) console.log(e.join(" "));  // i 2, then love 2, then code 1
```

### Top k: a min heap kept at size k

To keep the k largest, pop the smallest whenever the heap holds more than k. The top is then the kth largest. For the k closest points, flip it: a max heap by distance drops the farthest. For the top k frequent words, the top is the weakest entry kept: the lowest count, and on a tie the later word.

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
const nums = [3, 2, 1, 5, 6, 4];
const top = new Heap<number>((a, b) => a - b);
for (const x of nums) {
  top.push(x);
  if (top.size() > 2) top.pop();  // drop the smallest, keep the 2 largest
}
console.log(top.peek());  // 5, the 2nd largest

type Point = [x: number, y: number];
const dist2 = ([x, y]: Point): number => x * x + y * y;
const closest = new Heap<Point>((p, q) => dist2(q) - dist2(p));  // a max heap by distance
for (const p of [[3, 3], [5, -1], [-2, 4], [1, 1]] satisfies Point[]) {
  closest.push(p);
  if (closest.size() > 2) closest.pop();  // drop the farthest, keep the 2 closest
}
console.log(closest.size(), closest.peek());  // 2 [ 3, 3 ], the farther of the two

const counts = new Map<string, number>();
for (const w of ["i", "love", "code", "i", "love", "ts", "i"]) counts.set(w, (counts.get(w) ?? 0) + 1);
const kept = new Heap<[word: string, count: number]>((a, b) => a[1] - b[1] || b[0].localeCompare(a[0]));
for (const entry of counts) {  // each entry is a [string, number]
  kept.push(entry);
  if (kept.size() > 3) kept.pop();
}
const best: string[] = [];
for (let e = kept.pop(); e !== undefined; e = kept.pop()) best.push(e[0]);
console.log(best.reverse().join(" "));  // i love code, strongest first
```

### Two heaps: running median

A max heap holds the smaller half and a min heap the larger half. A small `move` helper does the pop, the check, and the push.

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
const low = new Heap<number>((a, b) => b - a);   // the smaller half, its largest on top
const high = new Heap<number>((a, b) => a - b);  // the larger half, its smallest on top
function move(from: Heap<number>, to: Heap<number>): void {
  const x = from.pop();
  if (x !== undefined) to.push(x);
}
const medians: string[] = [];
for (const x of [5, 15, 1, 3]) {
  low.push(x);
  move(low, high);                               // the biggest of the low half moves up
  if (high.size() > low.size()) move(high, low); // low keeps the extra one
  const a = low.peek() ?? 0;
  const b = high.peek() ?? a;
  medians.push((low.size() > high.size() ? a : (a + b) / 2).toFixed(1));
}
console.log(medians.join(" "));  // 5.0 10.0 5.0 4.0
```

Dijkstra (Graphs as Adjacency Lists) and merging k sorted lists (Linked Lists with ListNode) use this same class.

### Costs

| Call | Cost |
| --- | --- |
| `push(x)`, `pop()` | O(log n) |
| `peek()`, `size()` | O(1) |
| `new Heap(compare, items)` | O(n), a heapified copy of `items` |
| draining it with `pop()` until `undefined` | O(n log n), in order |

### Gotchas

- `pop()` and `peek()` are `T | undefined`. Drain with `for (let x = h.pop(); x !== undefined; x = h.pop())`, or check `size()` first and give `??` a value that can't come out.
- The compare function must return a number. `(a, b) => a > b` is TS2345, a mistake that plain JavaScript runs in the wrong order.
- The heap isn't sorted inside, only its top is in order. Pop until empty to list everything in order.
- Keep `undefined` out of `T`: in a `Heap<number | undefined>`, a popped `undefined` looks like an empty heap.
