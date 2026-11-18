# Stacks and Queues with Arrays

A typed array is the stack: `push` and `pop` at the end are O(1), and `at(-1)` peeks. Both `pop()` and `at(-1)` return `T | undefined`, which is the empty check. For a queue, never `shift()` in a loop, since it moves every remaining item, O(n) per call. Read from a head index instead. The runner has no packages, so there's no `Queue` or `Deque` class to import.

### Stack: an array

```typescript
const stack: number[] = [];
stack.push(1);
stack.push(2);
stack.push(3);
console.log(stack.at(-1));        // 3, the top (peek)
console.log(stack.pop());         // 3, removed
console.log(stack.length);        // 2
const top = stack.pop();
//    ^? const top: number | undefined
if (top !== undefined) console.log(top * 10);  // 20
console.log([].pop(), stack.length === 0);     // undefined false
```

### Queue: an array and a head index

`push` adds at the back, and `queue[head++]` takes from the front without moving anything. The read is `number | undefined`, so check it.

```typescript
const queue: number[] = [1, 2, 3];
let head = 0;
queue.push(4);                     // enqueue
console.log(queue[head++]);        // 1, dequeue
console.log(queue[head]);          // 2, the front
console.log(queue.length - head);  // 3, items left
while (head < queue.length) {
  const x = queue[head++];
  if (x === undefined) break;      // narrows x to number
  if (x === 2) queue.push(20);     // a BFS adds while it drains
}
console.log(head === queue.length);  // true, all taken
```

A `for...of` loop over an array also visits items pushed during the loop, so it drains a growing queue with no index at all, and each item is a `number`.

```typescript
const queue = [2];
const order: number[] = [];
for (const x of queue) {
  order.push(x);
  if (x < 20) queue.push(x * 3);
}
console.log(order.join(" "));  // 2 6 18 54
```

### Why not shift

```typescript
const q = [10, 20, 30];
console.log(q.shift());  // 10, but every other item moved down one slot
console.log(q);          // [ 20, 30 ]
q.unshift(5);            // adding at the front moves every item too
console.log(q);          // [ 5, 20, 30 ]
```

### Calls and costs

| Call | Does | Cost |
| --- | --- | --- |
| `a.push(x)` / `a.pop()` | add / remove at the end, `pop` gives `T \| undefined` | O(1) |
| `a.at(-1)` | the last item, `T \| undefined` | O(1) |
| `a[head++]` | take from the front by index, `T \| undefined` | O(1) |
| `for (const x of a)` | every item, those pushed during the loop too, as `T` | O(1) each |
| `a.shift()` / `a.unshift(x)` | remove / add at the front | O(n) |

### Valid parentheses

A `Map<string, string>` from each closer to its opener. Popping an empty stack gives `undefined`, which matches no opener.

```typescript
function isValid(s: string): boolean {
  const opener = new Map<string, string>([[")", "("], ["]", "["], ["}", "{"]]);
  const stack: string[] = [];
  for (const ch of s) {
    const open = opener.get(ch);
    if (open === undefined) stack.push(ch);       // an opener
    else if (stack.pop() !== open) return false;  // wrong or missing opener
  }
  return stack.length === 0;  // nothing left open
}
console.log(isValid("([]{})"), isValid("(]"), isValid("(("));  // true false false
```

### Simulate with a stack: reverse Polish notation

```typescript
function evalRPN(tokens: readonly string[]): number {
  const stack: number[] = [];
  for (const t of tokens) {
    if (!["+", "-", "*", "/"].includes(t)) {
      stack.push(Number(t));
      continue;
    }
    const b = stack.pop();  // the right operand comes off first
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error(`not enough operands for ${t}`);
    if (t === "+") stack.push(a + b);
    else if (t === "-") stack.push(a - b);
    else if (t === "*") stack.push(a * b);
    else stack.push(Math.trunc(a / b));  // toward zero, like C and Java
  }
  return stack.pop() ?? 0;
}
console.log(evalRPN(["4", "13", "5", "/", "+", "-7", "*"]));  // -42
```

### Min stack

```typescript
class MinStack {
  #items: number[] = [];
  #mins: number[] = [];  // #mins.at(-1) is the smallest item still on the stack

  push(x: number): void {
    this.#items.push(x);
    this.#mins.push(Math.min(x, this.#mins.at(-1) ?? x));
  }

  pop(): number | undefined {
    this.#mins.pop();
    return this.#items.pop();
  }

  top(): number | undefined {
    return this.#items.at(-1);
  }

  getMin(): number | undefined {
    return this.#mins.at(-1);
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

The stack holds the days whose answer isn't known yet, their temperatures falling. Keeping `[day, temp]` tuples means the top's temperature needs no second lookup.

```typescript
const temps = [73, 74, 75, 71, 69, 72, 76, 73];
const wait = new Array<number>(temps.length).fill(0);
const stack: [day: number, temp: number][] = [];
for (const [i, t] of temps.entries()) {
  let top = stack.at(-1);
  while (top !== undefined && top[1] < t) {
    stack.pop();
    wait[top[0]] = i - top[0];  // a warmer day answers each colder one
    top = stack.at(-1);
  }
  stack.push([i, t]);
}
console.log(wait.join(" "));  // 1 1 4 2 1 1 0 0
```

### Monotonic deque: sliding window maximum

An array with a head index is a deque too: the front is `dq[head]`, `head++` drops it, and `push` and `pop` work the back while `dq.length > head`. It holds `[index, value]` pairs with falling values, so the front is the window's maximum.

```typescript
const nums = [1, 3, -1, -3, 5, 3, 6, 7];
const k = 3;
const dq: [index: number, value: number][] = [];
let head = 0;
const out: number[] = [];
for (const [i, x] of nums.entries()) {
  while (dq.length > head && (dq.at(-1)?.[1] ?? Infinity) <= x) dq.pop();  // smaller ones never win
  dq.push([i, x]);
  const front = dq[head];
  if (front !== undefined && front[0] <= i - k) head++;                   // it left the window
  const max = dq[head];
  if (i >= k - 1 && max !== undefined) out.push(max[1]);
}
console.log(out.join(" "));  // 3 3 5 5 6 7
```

### Circular queue: a fixed array, a head, and a size

A circular queue keeps a head and a size. The slot after the last item is `(head + size) % capacity`.

```typescript
class CircularQueue {
  #slots: number[];
  #head = 0;
  #size = 0;

  constructor(capacity: number) {
    this.#slots = new Array<number>(capacity).fill(0);
  }

  enqueue(x: number): boolean {
    if (this.isFull()) return false;
    this.#slots[(this.#head + this.#size) % this.#slots.length] = x;
    this.#size++;
    return true;
  }

  dequeue(): boolean {
    if (this.#size === 0) return false;
    this.#head = (this.#head + 1) % this.#slots.length;
    this.#size--;
    return true;
  }

  front(): number {
    return this.#size === 0 ? -1 : (this.#slots[this.#head] ?? -1);
  }

  rear(): number {
    return this.#size === 0 ? -1 : (this.#slots[(this.#head + this.#size - 1) % this.#slots.length] ?? -1);
  }

  isFull(): boolean {
    return this.#size === this.#slots.length;
  }
}
const cq = new CircularQueue(3);
console.log(cq.enqueue(1), cq.enqueue(2), cq.enqueue(3), cq.enqueue(4));  // true true true false
cq.dequeue();
cq.enqueue(4);                                                           // wraps to slot 0
console.log(cq.front(), cq.rear(), cq.isFull());                         // 2 4 true
```

### Gotchas

- `shift()` inside a BFS loop is O(n) each time, so the BFS becomes O(n^2). Use a head index or `for...of` over the growing array.
- `pop()`, `shift()`, `at(-1)`, and `queue[head]` are all `T | undefined`, and none of them throws on an empty array. Narrow the result, which is also your empty check.
- `stack.pop()!` compiles and silences the check, and on an empty stack the `undefined` flows on as if it were a number. Check it and throw a clear error instead, as `evalRPN` does.
- `-7 / 2` is `-3.5`, and `Math.floor` makes it `-4`. Integer division toward zero, as most problems expect, is `Math.trunc(a / b)`.
