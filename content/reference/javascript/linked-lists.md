# Linked Lists

JavaScript has no linked list, so you write the node class. LeetCode's is `ListNode` with `val` and `next`, and `null` ends the list. Nodes link by reference: `a.next = b` points at the real `b`, never a copy. Most problems are a walk with one, two, or three pointers, and a dummy node in front of the head saves the special case for the first node.

### The node class (LeetCode shape), build, print

```javascript
class ListNode {
  constructor(val = 0, next = null) {
    this.val = val;
    this.next = next;
  }
}

function fromArray(values) {
  const dummy = new ListNode();
  let tail = dummy;
  for (const v of values) {
    tail.next = new ListNode(v);
    tail = tail.next;
  }
  return dummy.next;
}

function toArray(head) {
  const out = [];
  for (let node = head; node !== null; node = node.next) out.push(node.val);
  return out;
}

const head = fromArray([3, 1, 4]);
console.log(head.next.val);               // 1
console.log(head.next.next.next);         // null, the end
console.log(toArray(head).join(" -> "));  // 3 -> 1 -> 4
console.log(toArray(fromArray([])));      // [], an empty list is null
```

### Reverse

Save `next` before you overwrite `curr.next`, or the rest of the list is lost.

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
{{code}}
```

```javascript
function reverse(head) {
  let prev = null;
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

function reverseRec(head) {
  if (head === null || head.next === null) return head;
  const newHead = reverseRec(head.next);
  head.next.next = head;  // the node after me points back at me
  head.next = null;
  return newHead;
}
console.log(toArray(reverseRec(fromArray([1, 2, 3]))).join(" "));  // 3 2 1
```

### Dummy head: delete every match

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
{{code}}
```

```javascript
function removeAll(head, target) {
  const dummy = new ListNode(0, head);
  let prev = dummy;
  while (prev.next !== null) {
    if (prev.next.val === target) prev.next = prev.next.next;  // skip it
    else prev = prev.next;
  }
  return dummy.next;  // the head may have changed
}
console.log(toArray(removeAll(fromArray([7, 1, 7, 2, 7]), 7)).join(" "));  // 1 2
```

### Two pointers n apart: remove the nth from the end

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
{{code}}
```

```javascript
function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head);
  let fast = dummy;
  let slow = dummy;
  for (let i = 0; i < n; i++) fast = fast.next;  // fast leads by n
  while (fast.next !== null) {
    fast = fast.next;
    slow = slow.next;
  }
  slow.next = slow.next.next;  // slow sits just before the one to remove
  return dummy.next;
}
console.log(toArray(removeNthFromEnd(fromArray([1, 2, 3, 4, 5]), 2)).join(" "));  // 1 2 3 5
console.log(toArray(removeNthFromEnd(fromArray([1]), 1)));                        // []
```

### Merge two sorted lists

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
{{code}}
```

```javascript
function mergeTwo(a, b) {
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
```

### Merge k sorted lists: a heap of nodes

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
const toArray = (h) => { const out = []; for (; h; h = h.next) out.push(h.val); return out; };
{{code}}
```

```javascript
const { MinPriorityQueue } = require("@datastructures-js/priority-queue");
function mergeK(lists) {
  const heap = new MinPriorityQueue((node) => node.val);
  for (const head of lists) if (head !== null) heap.enqueue(head);
  const dummy = new ListNode();
  let tail = dummy;
  while (!heap.isEmpty()) {
    const node = heap.dequeue();      // the smallest head
    tail.next = node;
    tail = node;
    if (node.next !== null) heap.enqueue(node.next);
  }
  return dummy.next;
}
const lists = [fromArray([1, 4, 5]), fromArray([1, 3, 4]), fromArray([2, 6]), null];
console.log(toArray(mergeK(lists)).join(" "));  // 1 1 2 3 4 4 5 6
```

### Fast and slow: the middle and a cycle

`slow` moves 1 and `fast` moves 2. When `fast` runs off the end, `slow` is at the middle (the second middle for an even length). If they ever meet, there is a cycle. `===` compares nodes, not values.

```javascript harness
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
const fromArray = (a) => a.reduceRight((next, val) => new ListNode(val, next), null);
{{code}}
```

```javascript
function middle(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow;
}
console.log(middle(fromArray([1, 2, 3, 4, 5])).val);  // 3
console.log(middle(fromArray([1, 2, 3, 4])).val);     // 3

function hasCycle(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}
const looped = fromArray([1, 2, 3]);
looped.next.next.next = looped.next;  // 3 links back to 2
console.log(hasCycle(looped), hasCycle(fromArray([1, 2])));  // true false
```

### Doubly linked list with sentinels

`prev` and `next` on every node, and a fake head and tail, make removing any node O(1). With a `Map` from key to node, this is an LRU cache.

```javascript
class DNode {
  constructor(key, val) {
    this.key = key;
    this.val = val;
    this.prev = null;
    this.next = null;
  }
}
const head = new DNode(0, 0);  // sentinels: never removed
const tail = new DNode(0, 0);
head.next = tail;
tail.prev = head;
function addFront(node) {
  node.prev = head;
  node.next = head.next;
  head.next.prev = node;
  head.next = node;
}
function unlink(node) {
  node.prev.next = node.next;
  node.next.prev = node.prev;
}
const a = new DNode("a", 1);
const b = new DNode("b", 2);
addFront(a);
addFront(b);              // b a
unlink(a);
addFront(a);              // a b, a was used most recently
console.log(head.next.key, head.next.next.key, tail.prev.key);  // a b b
```

### Gotchas

- `while (node.next)` stops one node early and `node.next.next` throws `TypeError` on the last node. Test `fast !== null && fast.next !== null` in that order.
- `if (!node.val)` is true for a node holding `0`. Test the node itself, `node === null`, to find the end.
- After moving a pointer, nothing changes in the list. Only assigning to `.next` relinks nodes.
- Recursion on a long list (more than about 10,000 nodes) throws `RangeError: Maximum call stack size exceeded`. Walk it with a loop.
