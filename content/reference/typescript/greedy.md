# Greedy Algorithms

A greedy algorithm makes the choice that looks best right now and never takes it back. It is usually one pass, often after a sort: track the best so far, take the earliest-ending interval, hand the smallest cookie that fits. It is only right when a swap argument shows the local choice never hurts, so check a small counterexample before trusting it. In TypeScript the pass is mostly `for...of` and `entries()`, which hand you each value without a `T | undefined` read.

### Track the best so far: buy low, sell high

```typescript
const prices = [7, 1, 5, 3, 6, 4];
let lowest = Infinity;
let best = 0;
for (const p of prices) {
  lowest = Math.min(lowest, p);       // the cheapest day so far
  best = Math.max(best, p - lowest);  // selling today
}
console.log(best);  // 5, buy at 1 and sell at 6
```

### The farthest reach: jump game

```typescript
function canJump(nums: readonly number[]): boolean {
  let reach = 0;
  for (const [i, step] of nums.entries()) {
    if (i > reach) return false;  // this index can't be reached
    reach = Math.max(reach, i + step);
  }
  return true;
}
console.log(canJump([2, 3, 1, 1, 4]), canJump([3, 2, 1, 0, 4]));  // true false

function minJumps(nums: readonly number[]): number {  // the fewest jumps, by BFS-like levels
  let jumps = 0;
  let end = 0;
  let farthest = 0;
  for (const [i, step] of nums.slice(0, -1).entries()) {  // every index but the last
    farthest = Math.max(farthest, i + step);
    if (i === end) {  // this jump's range is used up
      jumps++;
      end = farthest;
    }
  }
  return jumps;
}
console.log(minJumps([2, 3, 1, 1, 4]));  // 2
```

### A running total that resets: gas station

If the tank goes negative, no station from the start up to here works, so start again after it.

```typescript
const gas = [1, 2, 3, 4, 5];
const cost = [3, 4, 5, 1, 2];
let total = 0;
let tank = 0;
let start = 0;
for (const [i, g] of gas.entries()) {
  const gain = g - (cost[i] ?? 0);
  total += gain;
  tank += gain;
  if (tank < 0) {
    start = i + 1;
    tank = 0;
  }
}
console.log(total < 0 ? -1 : start);  // 3
```

### Sort both, then two pointers: assign cookies

```typescript
const greed = [1, 2, 3].toSorted((a, b) => a - b);
const cookies = [1, 1].toSorted((a, b) => a - b);
let child = 0;
for (const size of cookies) {
  const need = greed[child];  // undefined once every child has one
  if (need !== undefined && size >= need) child++;  // the smallest cookie that fits
}
console.log(child);  // 1 child is content
```

### Intervals by end: the fewest to remove

Keep the interval that ends first. It leaves the most room for the rest. Typed as `[number, number]` tuples, `a[1]` is a `number`.

```typescript
type Interval = [start: number, end: number];
const intervals: Interval[] = [[1, 2], [2, 3], [3, 4], [1, 3]];
intervals.sort((a, b) => a[1] - b[1]);  // by end
let kept = 0;
let lastEnd = -Infinity;
for (const [start, end] of intervals) {
  if (start >= lastEnd) {  // no overlap: keep it
    kept++;
    lastEnd = end;
  }
}
console.log(intervals.length - kept);  // 1, remove [1,3]

const balloons: Interval[] = [[10, 16], [2, 8], [1, 6], [7, 12]];
balloons.sort((a, b) => a[1] - b[1]);
let arrows = 0;
let shotAt = -Infinity;
for (const [s, e] of balloons) {
  if (s > shotAt) {  // this arrow misses it, shoot a new one at its end
    arrows++;
    shotAt = e;
  }
}
console.log(arrows);  // 2
```

### Sweep line: the most at once

Turn each interval into two events, `+1` at its start and `-1` at its end. Sort by time, ends before starts at the same time, then keep a running count.

```typescript
const meetings: [start: number, end: number][] = [[0, 30], [5, 10], [15, 20], [10, 15]];
const events: [time: number, change: number][] = meetings.flatMap(([s, e]): [number, number][] => [[s, 1], [e, -1]]);
events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);  // -1 sorts first on a tie
let inUse = 0;
let most = 0;
for (const [, change] of events) {
  inUse += change;
  most = Math.max(most, inUse);
}
console.log(most);  // 2 rooms
```

With a heap instead: sort by start, and keep a min heap of end times for the rooms in use. `Heap<T>` is the class from Typed Heaps and Priority Queues.

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
const meetings: [start: number, end: number][] = [[0, 30], [5, 10], [15, 20], [10, 15]];
meetings.sort((a, b) => a[0] - b[0]);
const ends = new Heap<number>((a, b) => a - b);
for (const [s, e] of meetings) {
  if ((ends.peek() ?? Infinity) <= s) ends.pop();  // reuse the room that frees first
  ends.push(e);
}
console.log(ends.size());  // 2
```

### Last positions: partition labels

```typescript
const s = "ababcbacadefegdehijhklij";
const last = new Map<string, number>();
for (const [i, ch] of [...s].entries()) last.set(ch, i);  // the last index wins
const sizes: number[] = [];
let start = 0;
let end = 0;
for (const [i, ch] of [...s].entries()) {
  end = Math.max(end, last.get(ch) ?? i);
  if (i === end) {  // every letter so far ends by here
    sizes.push(end - start + 1);
    start = i + 1;
  }
}
console.log(sizes.join(" "));  // 9 7 8
```

### Majority vote (Boyer-Moore)

```typescript
const nums = [2, 2, 1, 1, 1, 2, 2];
let candidate: number | undefined;
let count = 0;
for (const x of nums) {
  if (count === 0) candidate = x;
  count += x === candidate ? 1 : -1;  // different values cancel out
}
console.log(candidate);  // 2
```

### When greedy fails

Taking the biggest coin first works for 1, 5, 10, 25, but not for every set of coins. When a choice can block a better one later, use dynamic programming.

```typescript
const coins = [1, 3, 4];
let amount = 6;
let used = 0;
for (const c of coins.toSorted((a, b) => b - a)) {
  used += Math.floor(amount / c);
  amount %= c;
}
console.log(used);  // 3 coins (4 + 1 + 1), but 3 + 3 needs only 2
```

### Gotchas

- Sort numbers with a compare function first. `[[10, 1], [9, 2]].sort()` compares the rows as strings, and it type-checks.
- For intervals that touch (`[1, 2]` and `[2, 3]`), decide whether touching counts as overlap: `start >= lastEnd` keeps both, `start > lastEnd` doesn't.
- In a sweep line, sort ends before starts at the same time, or two back-to-back meetings count as two rooms.
- Start a running best at `-Infinity` or the first item, not `0`, when every value can be negative.
