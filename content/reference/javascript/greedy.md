# Greedy Algorithms

A greedy algorithm makes the choice that looks best right now and never takes it back. It is usually one pass, often after a sort: track the best so far, take the earliest-ending interval, hand the smallest cookie that fits. It is only right when a swap argument shows the local choice never hurts, so check a small counterexample before trusting it.

### Track the best so far: buy low, sell high

```javascript
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

```javascript
function canJump(nums) {
  let reach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false;          // this index can't be reached
    reach = Math.max(reach, i + nums[i]);
  }
  return true;
}
console.log(canJump([2, 3, 1, 1, 4]), canJump([3, 2, 1, 0, 4]));  // true false

function minJumps(nums) {  // the fewest jumps, by BFS-like levels
  let jumps = 0;
  let end = 0;
  let farthest = 0;
  for (let i = 0; i < nums.length - 1; i++) {
    farthest = Math.max(farthest, i + nums[i]);
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

```javascript
const gas = [1, 2, 3, 4, 5];
const cost = [3, 4, 5, 1, 2];
let total = 0;
let tank = 0;
let start = 0;
for (let i = 0; i < gas.length; i++) {
  total += gas[i] - cost[i];
  tank += gas[i] - cost[i];
  if (tank < 0) {
    start = i + 1;
    tank = 0;
  }
}
console.log(total < 0 ? -1 : start);  // 3
```

### Sort both, then two pointers: assign cookies

```javascript
const greed = [1, 2, 3].sort((a, b) => a - b);
const cookies = [1, 1].sort((a, b) => a - b);
let child = 0;
for (const size of cookies) {
  if (child < greed.length && size >= greed[child]) child++;  // the smallest cookie that fits
}
console.log(child);  // 1 child is content
```

### Intervals by end: the fewest to remove

Keep the interval that ends first. It leaves the most room for the rest.

```javascript
const intervals = [[1, 2], [2, 3], [3, 4], [1, 3]];
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

const balloons = [[10, 16], [2, 8], [1, 6], [7, 12]];
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

```javascript
const meetings = [[0, 30], [5, 10], [15, 20], [10, 15]];
const events = [];
for (const [s, e] of meetings) events.push([s, 1], [e, -1]);
events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);  // -1 sorts first on a tie
let inUse = 0;
let most = 0;
for (const [, change] of events) {
  inUse += change;
  most = Math.max(most, inUse);
}
console.log(most);  // 2 rooms
```

With a heap instead: sort by start, and keep a min-heap of end times for the rooms in use.

```javascript
const { MinPriorityQueue } = require("@datastructures-js/priority-queue");
const meetings = [[0, 30], [5, 10], [15, 20], [10, 15]].sort((a, b) => a[0] - b[0]);
const ends = new MinPriorityQueue();
for (const [s, e] of meetings) {
  if (!ends.isEmpty() && ends.front() <= s) ends.dequeue();  // reuse the room that frees first
  ends.enqueue(e);
}
console.log(ends.size());  // 2
```

### Last positions: partition labels

```javascript
const s = "ababcbacadefegdehijhklij";
const last = new Map();
for (let i = 0; i < s.length; i++) last.set(s[i], i);  // the last index wins
const sizes = [];
let start = 0;
let end = 0;
for (let i = 0; i < s.length; i++) {
  end = Math.max(end, last.get(s[i]));
  if (i === end) {  // every letter so far ends by here
    sizes.push(end - start + 1);
    start = i + 1;
  }
}
console.log(sizes.join(" "));  // 9 7 8
```

### Majority vote (Boyer-Moore)

```javascript
const nums = [2, 2, 1, 1, 1, 2, 2];
let candidate = null;
let count = 0;
for (const x of nums) {
  if (count === 0) candidate = x;
  count += x === candidate ? 1 : -1;  // different values cancel out
}
console.log(candidate);  // 2
```

### When greedy fails

Taking the biggest coin first works for 1, 5, 10, 25, but not for every set of coins. When a choice can block a better one later, use dynamic programming.

```javascript
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

- Sort numbers with a compare function first. `[[10, 1], [9, 2]].sort()` compares the rows as strings.
- For intervals that touch (`[1, 2]` and `[2, 3]`), decide whether touching counts as overlap: `start >= lastEnd` keeps both, `start > lastEnd` doesn't.
- In a sweep line, sort ends before starts at the same time, or two back-to-back meetings count as two rooms.
- Start a running best at `-Infinity` or the first item, not `0`, when every value can be negative.
