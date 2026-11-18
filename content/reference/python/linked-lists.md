# Linked Lists

Python has no linked list for interview problems, so you write the node yourself. LeetCode's shape is `ListNode(val, next)`, with `None` marking the end. For a real queue in your own code, use `collections.deque`.

### The node class (LeetCode shape), build, print

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def build(values):
    dummy = tail = ListNode()
    for v in values:
        tail.next = ListNode(v)
        tail = tail.next
    return dummy.next

def to_list(head):
    out = []
    while head:                  # a node is truthy, None is falsy
        out.append(head.val)
        head = head.next
    return out

head = build([4, 8, 15])         # the same as ListNode(4, ListNode(8, ListNode(15)))
print(to_list(head))                          # [4, 8, 15]
print(" -> ".join(map(str, to_list(head))))   # 4 -> 8 -> 15
print(build([]))                              # None  an empty list
```

### Reverse

The blocks below use `ListNode`, `build`, and `to_list` from the first one.

```python harness
class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
def build(values, head=None):
    for v in reversed(values): head = ListNode(v, head)
    return head
def to_list(head):
    return [] if head is None else [head.val] + to_list(head.next)
{{code}}
```

```python
def reverse(head):
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev                  # the old tail is the new head

def reverse_rec(head):
    if head is None or head.next is None:
        return head
    new_head = reverse_rec(head.next)
    head.next.next = head        # the node after head points back at it
    head.next = None
    return new_head

print(to_list(reverse(build([1, 2, 3, 4]))))      # [4, 3, 2, 1]
print(to_list(reverse_rec(build([1, 2, 3]))))     # [3, 2, 1]
```

### Dummy head: delete every match

A dummy node before the head gives every real node a node before it, so deleting the first node needs no special case.

```python harness
class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
def build(values, head=None):
    for v in reversed(values): head = ListNode(v, head)
    return head
def to_list(head):
    return [] if head is None else [head.val] + to_list(head.next)
{{code}}
```

```python
def remove_all(head, target):
    dummy = ListNode(0, head)
    prev = dummy
    while prev.next:
        if prev.next.val == target:
            prev.next = prev.next.next   # skip it, prev stays put
        else:
            prev = prev.next
    return dummy.next                    # not head: head may be gone

print(to_list(remove_all(build([6, 1, 6, 2]), 6)))   # [1, 2]
```

### Two pointers n apart: remove the nth from the end

```python harness
class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
def build(values, head=None):
    for v in reversed(values): head = ListNode(v, head)
    return head
def to_list(head):
    return [] if head is None else [head.val] + to_list(head.next)
{{code}}
```

```python
def remove_nth_from_end(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n):
        fast = fast.next
    while fast.next:                     # move both until fast is on the last node
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next           # slow is just before the one to remove
    return dummy.next

print(to_list(remove_nth_from_end(build([1, 2, 3, 4, 5]), 2)))   # [1, 2, 3, 5]
print(to_list(remove_nth_from_end(build([1]), 1)))               # []
```

### Merge sorted lists: two by splicing, k with a heap

`ListNode` has no `<`, so each heap entry is `(value, list number, node)`. The list number breaks ties before two nodes are ever compared.

```python harness
class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
def build(values, head=None):
    for v in reversed(values): head = ListNode(v, head)
    return head
def to_list(head):
    return [] if head is None else [head.val] + to_list(head.next)
{{code}}
```

```python
import heapq

def merge(a, b):
    dummy = tail = ListNode()
    while a and b:
        if a.val <= b.val:
            tail.next = a
            a = a.next
        else:
            tail.next = b
            b = b.next
        tail = tail.next
    tail.next = a or b                   # splice on whatever is left
    return dummy.next

def merge_k(lists):
    heap = [(node.val, i, node) for i, node in enumerate(lists) if node]
    heapq.heapify(heap)
    dummy = tail = ListNode()
    while heap:
        _, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next

lists = [build([1, 4, 5]), build([1, 3, 4]), build([2, 6])]
print(to_list(merge(build([1, 2, 4]), build([1, 3, 4]))))   # [1, 1, 2, 3, 4, 4]
print(to_list(merge_k(lists)))           # [1, 1, 2, 3, 4, 4, 5, 6]
```

### Fast and slow: the middle and a cycle

```python harness
class ListNode:
    def __init__(self, val=0, next=None): self.val, self.next = val, next
def build(values, head=None):
    for v in reversed(values): head = ListNode(v, head)
    return head
{{code}}
```

```python
def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow                          # the second middle for an even length

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:                 # the same node, not just the same value
            return True
    return False

print(middle(build([1, 2, 3, 4, 5])).val, middle(build([1, 2, 3, 4])).val)   # 3 3
head = build([1, 2, 3])
head.next.next.next = head.next          # 3 links back to 2
print(has_cycle(head), has_cycle(build([1, 2])))   # True False
```

### Doubly linked list with sentinels (LRU cache)

Two sentinel nodes that are never removed mean every real node has a `prev` and a `next`. Pair it with a dict from key to node, and get and put are O(1).

```python
class DNode:
    def __init__(self, key=0, val=0):
        self.key, self.val = key, val
        self.prev = self.next = None

class DList:
    def __init__(self):
        self.head, self.tail = DNode(), DNode()
        self.head.next, self.tail.prev = self.tail, self.head

    def add_front(self, node):
        node.prev, node.next = self.head, self.head.next
        self.head.next.prev = node
        self.head.next = node

    def remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

d = DList()
a, b = DNode(1, 10), DNode(2, 20)
d.add_front(a)
d.add_front(b)                 # front to back: 2, 1
d.remove(a)
d.add_front(a)                 # 1 was used, move it to the front: 1, 2
lru = d.tail.prev              # the back is the least recently used
d.remove(lru)
print(lru.key)                 # 2
```

`collections.OrderedDict` has the same moves built in (`move_to_end(key)` and `popitem(last=False)`), which makes a quick check of your own version.

### Gotchas

- Printing a node shows `<__main__.ListNode object at 0x...>`. Print `to_list(head)`, or give the class a `__repr__`.
- Save `nxt = curr.next` before you change `curr.next`, or the rest of the list is lost.
- Return `dummy.next`, not `head`, when the first node might have been removed.
- The recursive reverse goes one call deep per node, so a list of a few thousand nodes passes the default recursion limit of 1000. Use the loop.
