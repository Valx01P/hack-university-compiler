# Linked Lists with ListNode

There's no linked list built in, so you write the node class. LeetCode's TypeScript one is `ListNode` with `val: number` and `next: ListNode | null`, and `null` ends the list. Strict null checks make you handle that `null` at every step: `head.next.val` doesn't compile until you've checked `head.next`, which is exactly the check that stops the crash at the end of a list.

### The node class (LeetCode shape), build, print

Declare the fields and assign them in the constructor, since Node can't strip parameter properties (`constructor(public val: number)`).

```typescript
class ListNode {
  val: number;
  next: ListNode | null;

  constructor(val = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

function fromArray(values: readonly number[]): ListNode | null {
  const dummy = new ListNode();
  let tail = dummy;
  for (const v of values) {
    tail.next = new ListNode(v);
    tail = tail.next;  // narrowed to ListNode by the line above
  }
  return dummy.next;
}

function toArray(head: ListNode | null): number[] {
  const out: number[] = [];
  for (let node = head; node !== null; node = node.next) out.push(node.val);
  return out;
}

const head = fromArray([3, 1, 4]);
console.log(head?.next?.val, head?.next?.next?.next);  // 1 null, the end
console.log(toArray(head).join(" -> "));  // 3 -> 1 -> 4
console.log(toArray(fromArray([])));      // [], an empty list is null
```

```typescript harness
class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }
{{code}}
```

```typescript error
const head = new ListNode(1);
console.log(head.next.val); // TS18047: 'head.next' is possibly 'null'.
```

### Reverse

Save `next` before you overwrite `curr.next`, or the rest of the list is lost.

```typescript harness
class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }
const fromArray = (values: readonly number[]): ListNode | null => values.reduceRight<ListNode | null>((next, val) => new ListNode(val, next), null);
const toArray = (head: ListNode | null): number[] => { const out: number[] = []; for (let n = head; n !== null; n = n.next) out.push(n.val); return out; };
{{code}}
```

```typescript
function reverse(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  let curr = head;
  while (curr !== null) {
    const next = curr.next;
    curr.next = prev;  // flip the arrow
    prev = curr;
    curr = next;
  }
  return prev;         // the new head
}
console.log(toArray(reverse(fromArray([1, 2, 3, 4]))).join(" "));  // 4 3 2 1

function reverseRec(head: ListNode | null): ListNode | null {
  if (head === null || head.next === null) return head;
  const newHead = reverseRec(head.next);
  head.next.next = head;  // the node after me points back at me
  head.next = null;
  return newHead;
}
console.log(toArray(reverseRec(fromArray([1, 2, 3]))).join(" "));  // 3 2 1
```

### Dummy head: delete matches, remove the nth from the end

A dummy node in front of the head means the first node is removed like any other. Typing `fast` and `slow` as `ListNode` (the dummy is never `null`) keeps the walk free of `?.`.

```typescript harness
class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }
const fromArray = (values: readonly number[]): ListNode | null => values.reduceRight<ListNode | null>((next, val) => new ListNode(val, next), null);
const toArray = (head: ListNode | null): number[] => { const out: number[] = []; for (let n = head; n !== null; n = n.next) out.push(n.val); return out; };
{{code}}
```

```typescript
function removeAll(head: ListNode | null, target: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let prev = dummy;
  while (prev.next !== null) {
    if (prev.next.val === target) prev.next = prev.next.next;  // skip it
    else prev = prev.next;
  }
  return dummy.next;  // the head may have changed
}
console.log(toArray(removeAll(fromArray([7, 1, 7, 2, 7]), 7)).join(" "));  // 1 2

function removeNthFromEnd(head: ListNode | null, n: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let fast: ListNode = dummy;
  let slow: ListNode = dummy;
  for (let i = 0; i < n && fast.next !== null; i++) fast = fast.next;  // fast leads by n
  while (fast.next !== null && slow.next !== null) {
    fast = fast.next;
    slow = slow.next;
  }
  slow.next = slow.next?.next ?? null;  // slow sits just before the one to remove
  return dummy.next;
}
console.log(toArray(removeNthFromEnd(fromArray([1, 2, 3, 4, 5]), 2)).join(" "));  // 1 2 3 5
console.log(toArray(removeNthFromEnd(fromArray([1]), 1)));                        // []
```

### Merge sorted lists: two, then k with a heap

For k lists, a heap of nodes ordered by `val` gives the smallest head each time. `Heap<T>` is the class from Typed Heaps and Priority Queues, and `filter((h) => h !== null)` narrows the heads to `ListNode[]`.

```typescript harness
class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }
const fromArray = (values: readonly number[]): ListNode | null => values.reduceRight<ListNode | null>((next, val) => new ListNode(val, next), null);
const toArray = (head: ListNode | null): number[] => { const out: number[] = []; for (let n = head; n !== null; n = n.next) out.push(n.val); return out; };
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
function mergeTwo(a: ListNode | null, b: ListNode | null): ListNode | null {
  const dummy = new ListNode();
  let tail = dummy;
  while (a !== null && b !== null) {
    if (a.val <= b.val) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a ?? b;  // splice on whatever is left
  return dummy.next;
}
console.log(toArray(mergeTwo(fromArray([1, 2, 4]), fromArray([1, 3, 4]))).join(" "));  // 1 1 2 3 4 4

function mergeK(lists: (ListNode | null)[]): ListNode | null {
  const heap = new Heap<ListNode>((a, b) => a.val - b.val, lists.filter((h) => h !== null));
  const dummy = new ListNode();
  let tail = dummy;
  for (let node = heap.pop(); node !== undefined; node = heap.pop()) {  // the smallest head
    tail.next = node;
    tail = node;
    if (node.next !== null) heap.push(node.next);
  }
  return dummy.next;
}
console.log(toArray(mergeK([fromArray([1, 4, 5]), fromArray([1, 3, 4]), fromArray([2, 6]), null])).join(" "));  // 1 1 2 3 4 4 5 6
```

### Fast and slow: the middle and a cycle

`slow` moves 1 and `fast` moves 2. When `fast` runs off the end, `slow` is at the middle (the second middle for an even length). If they ever meet, there is a cycle, and `===` compares nodes, not values. The extra `slow` checks are always true, and they tell the checker so.

```typescript harness
class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }
const fromArray = (values: readonly number[]): ListNode | null => values.reduceRight<ListNode | null>((next, val) => new ListNode(val, next), null);
{{code}}
```

```typescript
function middle(head: ListNode): ListNode {
  let slow = head;
  let fast: ListNode | null = head;
  while (fast !== null && fast.next !== null && slow.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow;
}
const [odd, even] = [fromArray([1, 2, 3, 4, 5]), fromArray([1, 2, 3, 4])];
if (odd !== null && even !== null) console.log(middle(odd).val, middle(even).val);  // 3 3

function hasCycle(head: ListNode | null): boolean {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null && slow !== null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}
const looped = new ListNode(1, new ListNode(2, new ListNode(3)));
const two = looped.next;
if (two?.next) two.next.next = two;  // 3 links back to 2
console.log(hasCycle(looped), hasCycle(fromArray([1, 2])));  // true false
```

### Doubly linked list with a sentinel

`prev` and `next` on every node make removing any node O(1). Start each node linked to itself, `prev: DNode = this`, and one sentinel makes a circle: `head.next` is the newest node and `head.prev` the oldest. The links are never `null`, so there's nothing to check. With a `Map<number, DNode>`, this is an LRU cache.

```typescript
class DNode {
  key: number;
  prev: DNode = this;  // a lone node is a circle of one
  next: DNode = this;

  constructor(key: number) {
    this.key = key;
  }
}
const head = new DNode(0);  // the sentinel, never removed
function addFront(node: DNode): void {
  node.prev = head;
  node.next = head.next;
  head.next.prev = node;
  head.next = node;
}
function unlink(node: DNode): void {
  node.prev.next = node.next;
  node.next.prev = node.prev;
}
const [a, b] = [new DNode(1), new DNode(2)];
addFront(a);
addFront(b);
unlink(a);
addFront(a);  // move 1 to the front: it was used most recently
console.log(head.next.key, head.next.next.key, head.prev.key);  // 1 2 2: the newest, the next, the oldest
```

### Gotchas

- `fast.next.next` compiles only after `fast !== null && fast.next !== null`, in that order. That's the check plain JavaScript forgets, and then it throws `TypeError` on the last node.
- `if (!node.val)` is true for a node holding `0`. Test the node itself, `node === null`, to find the end.
- `node!.next` compiles and crashes on the last node. A `?.` read, a typed dummy, or a loop condition says what happens at the end instead.
- Recursion on a long list (more than about 9,000 nodes) throws `RangeError: Maximum call stack size exceeded`. Walk it with a loop.
