# Stacks and Queues

A plain list is a stack: `append` pushes onto the end and `pop` takes from it, both O(1). For a queue use `collections.deque`, which adds and removes at both ends in O(1). Never use `list.pop(0)` as a queue: it shifts every item, so it's O(n).

### Stack: a list

```python
stack = []
stack.append(1)
stack.append(2)
stack.append(3)
print(stack[-1])         # 3  peek
print(stack.pop())       # 3
print(len(stack))        # 2
print(not stack)         # False  True when empty
while stack:
    print(stack.pop())   # 2, then 1
```

### Queue: deque

```python
from collections import deque

queue = deque([1, 2])
queue.append(3)          # enqueue at the back
print(queue.popleft())   # 1  dequeue from the front
print(queue[0])          # 2  the front
print(queue[-1])         # 3  the back
print(len(queue))        # 2
print(queue)             # deque([2, 3])
```

### Deque: both ends, rotate, maxlen

```python
from collections import deque

d = deque([2, 3])
d.appendleft(1)
d.append(4)
print(d)                 # deque([1, 2, 3, 4])
print(d.pop(), d.popleft())   # 4 1
d.extend([5, 6])
d.rotate(1)              # right by 1: the last item moves to the front
print(d)                 # deque([6, 2, 3, 5])
d.rotate(-2)             # left by 2
print(d)                 # deque([3, 5, 6, 2])

recent = deque(maxlen=3) # full: adding at one end drops from the other
for x in range(5):
    recent.append(x)
print(list(recent))      # [2, 3, 4]
```

### Calls

| Call | Does | Cost |
| --- | --- | --- |
| `stack.append(x)`, `stack.pop()` | push, pop the end | O(1) |
| `stack[-1]` | peek | O(1) |
| `q.append(x)`, `q.popleft()` | enqueue, dequeue | O(1) |
| `q.appendleft(x)`, `q.pop()` | the other two ends | O(1) |
| `q[0]`, `q[-1]` | the front and the back | O(1) |
| `q[i]` in the middle | index into a deque | O(n) |
| `q.rotate(k)` | right by k, left when k is negative | O(k) |
| `deque(xs, maxlen=k)` | keeps only the last k | |
| `xs.pop(0)`, `xs.insert(0, x)` | a list's front | O(n), avoid |

### Valid parentheses

```python
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in pairs:                        # a closer must match the last opener
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack                           # nothing left open

print(is_valid("([]{})"), is_valid("(]"), is_valid("(("))   # True False False
```

### Simulate with a stack

```python
ops = ["5", "2", "C", "D", "+"]   # C drops the last, D doubles it, + adds the last two
scores = []
for op in ops:
    if op == "+":
        scores.append(scores[-1] + scores[-2])
    elif op == "D":
        scores.append(2 * scores[-1])
    elif op == "C":
        scores.pop()
    else:
        scores.append(int(op))
print(scores, sum(scores))        # [5, 10, 15] 30
```

### Min stack: a second stack of minimums

```python
class MinStack:
    def __init__(self):
        self.items = []
        self.mins = []            # mins[i] is the smallest of items[:i + 1]

    def push(self, val):
        self.items.append(val)
        self.mins.append(min(val, self.mins[-1]) if self.mins else val)

    def pop(self):
        self.mins.pop()
        return self.items.pop()

    def top(self):
        return self.items[-1]

    def get_min(self):
        return self.mins[-1]

s = MinStack()
for x in [5, 2, 7, 1]:
    s.push(x)
print(s.get_min())                # 1
s.pop()
print(s.get_min(), s.top())       # 2 7
```

### Monotonic stack: days until warmer

The stack holds indexes whose answer isn't known yet, their values decreasing. A bigger value pops every smaller one and answers it.

```python
temps = [73, 74, 75, 71, 69, 72, 76, 73]
answer = [0] * len(temps)
stack = []
for i, t in enumerate(temps):
    while stack and temps[stack[-1]] < t:
        j = stack.pop()
        answer[j] = i - j         # day j waited until day i
    stack.append(i)
print(answer)                     # [1, 1, 4, 2, 1, 1, 0, 0]
```

The next greater value is the same loop storing `t` instead of `i - j`, with -1 left for indexes that never pop.

### Monotonic deque: sliding window maximum

The deque holds indexes in the window, their values decreasing, so the front is the window's maximum.

```python
from collections import deque

def window_max(nums, k):
    dq = deque()
    out = []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()              # smaller ones can never be the max again
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()          # the front slid out of the window
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out

print(window_max([1, 3, -1, -3, 5, 3, 6, 7], 3))   # [3, 3, 5, 5, 6, 7]
```

### Circular queue: a fixed list, a head, and a size

A circular queue keeps a head index and a size, and wraps with `%`.

```python
cap = 3
items = [None] * cap
head = size = 0
for x in [10, 20, 30]:
    items[(head + size) % cap] = x    # enqueue at the back
    size += 1
head, size = (head + 1) % cap, size - 1   # dequeue the front
items[(head + size) % cap] = 40       # the back wraps to index 0
size += 1
print(items, items[head], items[(head + size - 1) % cap])   # [40, 20, 30] 20 40
```

### Gotchas

- `stack.pop()` and `stack[-1]` on an empty list raise `IndexError`. Check `if stack:` first.
- `list.pop(0)` and `list.insert(0, x)` are O(n). A queue is a `deque`.
- `queue.Queue` is for threads and locks on every call. For algorithms, use `deque`.
- A deque has no slicing: `d[1:3]` is a `TypeError`. Use `list(d)[1:3]` or `itertools.islice`.
