# Trees

A binary tree is a node with a value and a `left` and a `right` child, with `None` for a missing child. Python has no tree class, so you write LeetCode's `TreeNode`. Most tree problems are a short recursive function that calls itself on `node.left` and `node.right`.

### The node class (LeetCode shape) and a builder

LeetCode writes a tree level by level, with `None` for a gap: `[3, 9, 20, None, None, 15, 7]`. Each real node takes the next two values as its children.

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node:
            node.left = next(kids, None)
            node.right = next(kids, None)
    return nodes[0] if nodes else None

root = build([3, 9, 20, None, None, 15, 7])
print(root.val, root.left.val, root.right.left.val)    # 3 9 15
small = TreeNode(2, TreeNode(1), TreeNode(3))          # by hand
print(small.left.val, small.right.val)                 # 1 3
line = "3 9 20 null null 15 7"                         # from input
print([None if t == "null" else int(t) for t in line.split()])   # [3, 9, 20, None, None, 15, 7]
```

The blocks below use `TreeNode` and `build` from this one.

### Preorder, inorder, postorder

```python harness
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right
def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node: node.left, node.right = next(kids, None), next(kids, None)
    return nodes[0] if nodes else None
{{code}}
```

```python
def preorder(node, out):
    if node:
        out.append(node.val)          # root, left, right
        preorder(node.left, out)
        preorder(node.right, out)
    return out

def inorder(node, out):
    if node:
        inorder(node.left, out)       # left, root, right
        out.append(node.val)
        inorder(node.right, out)
    return out

def postorder(node, out):
    if node:
        postorder(node.left, out)     # left, right, root
        postorder(node.right, out)
        out.append(node.val)
    return out

root = build([1, 2, 3, 4, 5])
print(preorder(root, []))     # [1, 2, 4, 5, 3]
print(inorder(root, []))      # [4, 2, 5, 1, 3]
print(postorder(root, []))    # [4, 5, 2, 3, 1]
```

### Inorder and preorder with a stack

```python harness
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right
def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node: node.left, node.right = next(kids, None), next(kids, None)
    return nodes[0] if nodes else None
{{code}}
```

```python
def preorder_iter(root):
    out = []
    stack = [root] if root else []
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.right:
            stack.append(node.right)  # right first, so left pops first
        if node.left:
            stack.append(node.left)
    return out

def inorder_iter(root):
    out, stack = [], []
    node = root
    while node or stack:
        while node:                   # go left as far as you can
            stack.append(node)
            node = node.left
        node = stack.pop()
        out.append(node.val)
        node = node.right
    return out

root = build([1, 2, 3, 4, 5])
print(preorder_iter(root))    # [1, 2, 4, 5, 3]
print(inorder_iter(root))     # [4, 2, 5, 1, 3]
```

For postorder, push left before right in `preorder_iter` and reverse the result: root, right, left backwards is left, right, root.

### Level order (BFS), one list per level

```python harness
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right
def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node: node.left, node.right = next(kids, None), next(kids, None)
    return nodes[0] if nodes else None
{{code}}
```

```python
from collections import deque

def level_order(root):
    levels = []
    queue = deque([root] if root else [])
    while queue:
        level = []
        for _ in range(len(queue)):   # only the nodes of this level
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        levels.append(level)
    return levels

levels = level_order(build([3, 9, 20, None, None, 15, 7]))
print(levels)                         # [[3], [9, 20], [15, 7]]
print([level[-1] for level in levels])   # [3, 20, 7]  the right side view
```

### Depth, size, diameter, invert

```python harness
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right
def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node: node.left, node.right = next(kids, None), next(kids, None)
    return nodes[0] if nodes else None
{{code}}
```

```python
def max_depth(node):
    if node is None:
        return 0
    return 1 + max(max_depth(node.left), max_depth(node.right))

def size(node):
    return 0 if node is None else 1 + size(node.left) + size(node.right)

def diameter(root):
    best = 0
    def depth(node):
        nonlocal best                 # a running best across every call
        if node is None:
            return 0
        left, right = depth(node.left), depth(node.right)
        best = max(best, left + right)
        return 1 + max(left, right)
    depth(root)
    return best

def invert(node):
    if node:
        node.left, node.right = invert(node.right), invert(node.left)
    return node

root = build([3, 9, 20, None, None, 15, 7])
print(max_depth(root), size(root), diameter(root))   # 3 5 3
print(invert(root).left.val)          # 20
```

### Binary search tree: insert, search, validate

In a BST every value in the left subtree is smaller than the node and every value in the right subtree is larger, so an inorder walk comes out sorted.

```python harness
class TreeNode:
    def __init__(self, val=0, left=None, right=None): self.val, self.left, self.right = val, left, right
def build(values):
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for node in nodes:
        if node: node.left, node.right = next(kids, None), next(kids, None)
    return nodes[0] if nodes else None
def inorder(node, out):
    if node: inorder(node.left, out); out.append(node.val); inorder(node.right, out)
    return out
{{code}}
```

```python
def insert(node, val):
    if node is None:
        return TreeNode(val)
    if val < node.val:
        node.left = insert(node.left, val)
    elif val > node.val:              # equal: already there, skip it
        node.right = insert(node.right, val)
    return node

def contains(node, val):
    while node and node.val != val:
        node = node.left if val < node.val else node.right
    return node is not None

def is_bst(node, low=float("-inf"), high=float("inf")):
    if node is None:
        return True
    if not low < node.val < high:     # bounds come from every ancestor
        return False
    return is_bst(node.left, low, node.val) and is_bst(node.right, node.val, high)

root = None
for v in [8, 3, 10, 1, 6, 14, 3]:
    root = insert(root, v)            # keep the returned root
print(inorder(root, []))              # [1, 3, 6, 8, 10, 14]
print(contains(root, 6), contains(root, 7))   # True False
print(is_bst(root), is_bst(build([5, 1, 4, None, None, 3, 6])))   # True False
```

### Gotchas

- `def walk(node, out=[])` makes one list when the function is defined and reuses it on every call. Pass `[]` in, or default to `None` and make the list inside.
- Test `node is None`, not `not node.val`: a node holding 0 is still a node.
- Checking each node only against its parent misses a BST that's wrong further down. Pass the low and high bounds, as `is_bst` does.
- Recursion goes one call per level. A tree built from sorted input is a line of nodes, so a few thousand of them pass the limit of 1000. Use `sys.setrecursionlimit` or a stack.
