# Linked Lists

Interview problems hand you a `ListNode` and expect you to relink it by hand. Java's `java.util.LinkedList` is a ready-made list and deque, but it never shows you its nodes, so here you write your own.

### The node class (LeetCode shape), build, print

A dummy node in front means the first value needs no special case. The real list starts at `dummy.next`.

```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

static ListNode build(int... values) {
    ListNode dummy = new ListNode(0);
    ListNode tail = dummy;
    for (int v : values) {
        tail.next = new ListNode(v);
        tail = tail.next;
    }
    return dummy.next;
}

static String show(ListNode head) {
    StringBuilder sb = new StringBuilder();
    for (ListNode cur = head; cur != null; cur = cur.next) {
        sb.append(cur.val).append(cur.next != null ? " -> " : "");
    }
    return sb.toString();
}

ListNode head = build(4, 8, 15);   // the same as new ListNode(4, new ListNode(8, new ListNode(15)))
System.out.println(show(head));   // 4 -> 8 -> 15
System.out.println(head.next.next.next);   // null, the end
int length = 0;
for (ListNode cur = head; cur != null; cur = cur.next) length++;
System.out.println(length);       // 3
```

### Reverse

```java harness
class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }
static ListNode build(int... vs) { ListNode d = new ListNode(0), t = d; for (int v : vs) { t.next = new ListNode(v); t = t.next; } return d.next; }
static String show(ListNode h) { StringBuilder sb = new StringBuilder(); for (ListNode c = h; c != null; c = c.next) sb.append(c.val).append(c.next != null ? " -> " : ""); return sb.toString(); }
{{code}}
```

```java
static ListNode reverse(ListNode head) {
    ListNode prev = null;
    ListNode cur = head;
    while (cur != null) {
        ListNode next = cur.next;  // save the rest first
        cur.next = prev;           // flip the arrow
        prev = cur;
        cur = next;
    }
    return prev;                   // the old tail is the new head
}

static ListNode reverseRec(ListNode head) {
    if (head == null || head.next == null) return head;
    ListNode newHead = reverseRec(head.next);
    head.next.next = head;         // the next node points back at this one
    head.next = null;
    return newHead;
}

System.out.println(show(reverse(build(1, 2, 3, 4)))); // 4 -> 3 -> 2 -> 1
System.out.println(show(reverseRec(build(5, 6, 7)))); // 7 -> 6 -> 5
```

### Dummy head: delete matches, remove the nth from the end

A dummy node before the head gives every real node a node before it, so removing the head needs no special case. For the nth from the end, move `fast` n nodes ahead, then move both until `fast` is on the last node. `slow` stops just in front of the node to remove.

```java harness
class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }
static ListNode build(int... vs) { ListNode d = new ListNode(0), t = d; for (int v : vs) { t.next = new ListNode(v); t = t.next; } return d.next; }
static String show(ListNode h) { StringBuilder sb = new StringBuilder(); for (ListNode c = h; c != null; c = c.next) sb.append(c.val).append(c.next != null ? " -> " : ""); return sb.toString(); }
{{code}}
```

```java
static ListNode removeAll(ListNode head, int target) {
    ListNode dummy = new ListNode(0, head);
    ListNode prev = dummy;
    while (prev.next != null) {
        if (prev.next.val == target) {
            prev.next = prev.next.next;   // unlink it, and check the new next
        } else {
            prev = prev.next;
        }
    }
    return dummy.next;                    // not head: head may be gone
}

static ListNode removeNthFromEnd(ListNode head, int n) {
    ListNode dummy = new ListNode(0, head);
    ListNode fast = dummy;
    ListNode slow = dummy;
    for (int i = 0; i < n; i++) fast = fast.next;
    while (fast.next != null) {
        fast = fast.next;
        slow = slow.next;
    }
    slow.next = slow.next.next;
    return dummy.next;
}

System.out.println(show(removeAll(build(7, 1, 7, 2), 7)));            // 1 -> 2
System.out.println(show(removeNthFromEnd(build(1, 2, 3, 4, 5), 2))); // 1 -> 2 -> 3 -> 5
System.out.println(show(removeNthFromEnd(build(1, 2), 2)));          // 2, the head removed
```

### Merge sorted lists: two by splicing, k with a heap of nodes

```java harness
class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }
static ListNode build(int... vs) { ListNode d = new ListNode(0), t = d; for (int v : vs) { t.next = new ListNode(v); t = t.next; } return d.next; }
static String show(ListNode h) { StringBuilder sb = new StringBuilder(); for (ListNode c = h; c != null; c = c.next) sb.append(c.val).append(c.next != null ? " -> " : ""); return sb.toString(); }
{{code}}
```

```java
import java.util.PriorityQueue;

static ListNode merge(ListNode a, ListNode b) {
    ListNode dummy = new ListNode(0);
    ListNode tail = dummy;
    while (a != null && b != null) {
        if (a.val <= b.val) {
            tail.next = a;
            a = a.next;
        } else {
            tail.next = b;
            b = b.next;
        }
        tail = tail.next;
    }
    tail.next = a != null ? a : b;   // splice in whatever is left
    return dummy.next;
}

System.out.println(show(merge(build(1, 3, 5), build(2, 4, 6, 8)))); // 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 8

ListNode[] lists = {build(1, 4, 5), build(1, 3, 4), build(2, 6)};
PriorityQueue<ListNode> heap = new PriorityQueue<>((x, y) -> Integer.compare(x.val, y.val));
for (ListNode node : lists) {
    if (node != null) heap.offer(node);   // the head of each list
}
ListNode dummy = new ListNode(0);
ListNode tail = dummy;
while (!heap.isEmpty()) {
    ListNode node = heap.poll();
    tail.next = node;
    tail = node;
    if (node.next != null) heap.offer(node.next);
}
System.out.println(show(dummy.next)); // 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
```

### Fast and slow: the middle and a cycle

```java harness
class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }
static ListNode build(int... vs) { ListNode d = new ListNode(0), t = d; for (int v : vs) { t.next = new ListNode(v); t = t.next; } return d.next; }
{{code}}
```

```java
static ListNode middle(ListNode head) {
    ListNode slow = head;
    ListNode fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow;                      // the second middle for an even length
}

static boolean hasCycle(ListNode head) {
    ListNode slow = head;
    ListNode fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) {
            return true;              // the same node object: a loop
        }
    }
    return false;
}

System.out.println(middle(build(1, 2, 3, 4, 5)).val); // 3
ListNode head = build(1, 2, 3, 4);
System.out.println(hasCycle(head));    // false
head.next.next.next.next = head.next;  // the tail links back to 2
System.out.println(hasCycle(head));    // true
```

### Doubly linked list with sentinels (LRU cache)

Two sentinel nodes that are never removed mean every real node has a `prev` and a `next`. Pair it with a `HashMap` from key to node, and get and put are O(1).

```java
class DNode {
    int key, val;
    DNode prev, next;
    DNode(int key, int val) { this.key = key; this.val = val; }
}

class DList {
    final DNode head = new DNode(0, 0);   // sentinels: never removed
    final DNode tail = new DNode(0, 0);

    DList() {
        head.next = tail;
        tail.prev = head;
    }

    void addFront(DNode node) {
        node.prev = head;
        node.next = head.next;
        head.next.prev = node;
        head.next = node;
    }

    void remove(DNode node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }
}

DList d = new DList();
DNode a = new DNode(1, 10);
DNode b = new DNode(2, 20);
d.addFront(a);
d.addFront(b);                // front to back: 2, 1
d.remove(a);
d.addFront(a);                // 1 was used, move it to the front: 1, 2
DNode lru = d.tail.prev;      // the back is the least recently used
d.remove(lru);
System.out.println(lru.key + " " + d.head.next.key);   // 2 1
```

`LinkedHashMap` with access order (`new LinkedHashMap<>(16, 0.75f, true)`) has the same moves built in, which makes a quick check of your own version.

### Gotchas

- Save `cur.next` before you change it, or the rest of the list is lost.
- Return `dummy.next`, not `head`: the old head may have been removed or moved.
- Check `fast != null` before `fast.next`. The `&&` stops at the first `false`, which avoids a `NullPointerException`.
- Never print or walk a list that may have a cycle with `while (cur != null)`. It never ends.
