# Stacks and Queues

An array is the stack: `push` and `pop` at the end are O(1), and `at(-1)` peeks. For a queue, never `shift()` in a loop: it moves every remaining item down one slot, O(n) per call. Read from a head index instead, or use the `Queue` and `Deque` classes from the `@datastructures-js` packages the sandbox has.

### Stack: an array

```javascript
const stack = [];
stack.push(1);
stack.push(2);
stack.push(3);
console.log(stack.at(-1));        // 3, the top (peek)
console.log(stack.pop());         // 3, removed
console.log(stack.length);        // 2
console.log(stack.length === 0);  // false, the empty check
console.log([].pop(), [].at(-1)); // undefined undefined, no error when empty
```

### Queue: an array and a head index

`push` adds at the back, and `queue[head++]` takes from the front without moving anything.

```javascript
const queue = [1, 2, 3];
let head = 0;
queue.push(4);                     // enqueue
console.log(queue[head++]);        // 1, dequeue
console.log(queue[head]);          // 2, the front
console.log(queue.length - head);  // 3, items left
const order = [];
while (head < queue.length) {
  const x = queue[head++];
  order.push(x);
  if (x === 2) queue.push(20);     // a BFS adds while it drains
}
console.log(order.join(" "));      // 2 3 4 20
```

### Why not shift

```javascript
const q = [10, 20, 30];
console.log(q.shift());  // 10, but every other item moved down one slot
console.log(q);          // [ 20, 30 ]
q.unshift(5);            // adding at the front moves every item too
console.log(q);          // [ 5, 20, 30 ]
```

Draining 300,000 items with `shift` takes seconds here, and about a millisecond with a head index.

### The Queue package

```javascript
const { Queue } = require("@datastructures-js/queue");
const q = new Queue();
q.enqueue(1);
q.enqueue(2);
q.push(3);                           // the same as enqueue
console.log(q.front(), q.back());    // 1 3
console.log(q.dequeue());            // 1, O(1)
console.log(q.size(), q.isEmpty());  // 2 false
console.log(q.toArray());            // [ 2, 3 ]
console.log(new Queue().dequeue());  // null when empty
const ready = Queue.fromArray([7, 8, 9]);
console.log(ready.front());          // 7
```

### Deque: both ends

```javascript
const { Deque } = require("@datastructures-js/deque");
const d = new Deque([2, 3]);
d.pushFront(1);
d.pushBack(4);
console.log(d.front(), d.back());    // 1 4
console.log(d.popFront());           // 1
console.log(d.popBack());            // 4
console.log(d.toArray(), d.size());  // [ 2, 3 ] 2
console.log(new Deque().popBack());  // null when empty
```

### Calls and costs

| Call | Does | Cost |
| --- | --- | --- |
| `a.push(x)` / `a.pop()` | add / remove at the end (the stack's top) | O(1) |
| `a.at(-1)` | the last item, `undefined` when empty | O(1) |
| `a.shift()` / `a.unshift(x)` | remove / add at the front | O(n) |
| `a[head++]` | take from the front by index | O(1) |
| `q.enqueue(x)`, `q.dequeue()`, `q.front()`, `q.back()` | the Queue package | O(1) |
| `d.pushFront(x)`, `d.popFront()`, `d.pushBack(x)`, `d.popBack()` | the Deque package | O(1) |
| `size()`, `isEmpty()`, `toArray()` | on both packages | O(1), O(1), O(n) |

### Valid parentheses

```javascript
function isValid(s) {
  const opener = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  const stack = [];
  for (const ch of s) {
    if (opener.has(ch)) {
      if (stack.pop() !== opener.get(ch)) return false;  // wrong or missing opener
    } else {
      stack.push(ch);
    }
  }
  return stack.length === 0;  // nothing left open
}
console.log(isValid("([]{})"), isValid("(]"), isValid("(("));  // true false false
```

### Simulate with a stack: reverse Polish notation

```javascript
const tokens = ["4", "13", "5", "/", "+", "-7", "*"];
const ops = new Set(["+", "-", "*", "/"]);
const stack = [];
for (const t of tokens) {
  if (!ops.has(t)) {
    stack.push(Number(t));
    continue;
  }
  const b = stack.pop();  // the right operand comes off first
  const a = stack.pop();
  if (t === "+") stack.push(a + b);
  else if (t === "-") stack.push(a - b);
  else if (t === "*") stack.push(a * b);
  else stack.push(Math.trunc(a / b));  // toward zero, like C and Java
}
console.log(stack.pop());  // -42
```

### Min stack

```javascript
class MinStack {
  constructor() {
    this.items = [];
    this.mins = [];  // mins.at(-1) is the smallest item still on the stack
  }

  push(x) {
    this.items.push(x);
    this.mins.push(this.mins.length === 0 ? x : Math.min(x, this.mins.at(-1)));
  }

  pop() {
    this.mins.pop();
    return this.items.pop();
  }

  top() {
    return this.items.at(-1);
  }

  getMin() {
    return this.mins.at(-1);
  }
}
const s = new MinStack();
s.push(5);
s.push(2);
s.push(7);
console.log(s.getMin());           // 2
s.pop();
s.pop();
console.log(s.getMin(), s.top());  // 5 5
```

### Monotonic stack: days until warmer

The stack holds indexes whose answer isn't known yet, their temperatures falling. A warmer day pops and answers each colder one.

```javascript
const temps = [73, 74, 75, 71, 69, 72, 76, 73];
const wait = new Array(temps.length).fill(0);
const stack = [];
for (let i = 0; i < temps.length; i++) {
  while (stack.length > 0 && temps[stack.at(-1)] < temps[i]) {
    const j = stack.pop();
    wait[j] = i - j;
  }
  stack.push(i);
}
console.log(wait.join(" "));  // 1 1 4 2 1 1 0 0
```

### Monotonic deque: sliding window maximum

The deque holds indexes with falling values. The front is the window's maximum.

```javascript
const { Deque } = require("@datastructures-js/deque");
const nums = [1, 3, -1, -3, 5, 3, 6, 7];
const k = 3;
const dq = new Deque();
const out = [];
for (let i = 0; i < nums.length; i++) {
  if (!dq.isEmpty() && dq.front() <= i - k) dq.popFront();           // it left the window
  while (!dq.isEmpty() && nums[dq.back()] <= nums[i]) dq.popBack();  // smaller ones never win
  dq.pushBack(i);
  if (i >= k - 1) out.push(nums[dq.front()]);
}
console.log(out.join(" "));  // 3 3 5 5 6 7
```

### Circular queue: a fixed array, a head, and a size

A circular queue keeps a head and a size. The slot after the last item is `(head + size) % capacity`.

```javascript
const capacity = 3;
const slots = new Array(capacity);
let head = 0;
let size = 0;
for (const x of [1, 2, 3]) slots[(head + size++) % capacity] = x;  // enqueue three
head = (head + 1) % capacity;                                     // dequeue one
size--;
slots[(head + size++) % capacity] = 4;                            // wraps to slot 0
console.log(slots[head], slots[(head + size - 1) % capacity], size === capacity);  // 2 4 true
```

### Gotchas

- `shift()` inside a BFS loop is O(n) each time, so the BFS becomes O(n^2). Use a head index or the `Queue` package.
- `pop()`, `shift()`, and `at(-1)` on an empty array return `undefined`, and the packages return `null`. Nothing throws, so check `length` or `isEmpty()` first.
- The packages export objects: `const { Queue } = require("@datastructures-js/queue")` needs the braces.
- `-7 / 2` is `-3.5`, and `Math.floor` makes it `-4`. Integer division toward zero, as most problems expect, is `Math.trunc(a / b)`.
