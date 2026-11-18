# Trees

JavaScript has no tree type, so you write the node class. LeetCode's is `TreeNode` with `val`, `left`, and `right`, and `null` for a missing child. Problems give a tree as a level-order array with `null` gaps (`[3, 9, 20, null, null, 15, 7]`). Most answers are a short recursion on `left` and `right`, or a BFS with a queue.

### The node class (LeetCode shape) and a builder

```javascript
class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

function buildTree(values) {  // level order, null for a missing child
  if (values.length === 0 || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  let head = 0;
  let i = 1;
  while (i < values.length) {
    const node = queue[head++];
    if (values[i] !== null) {
      node.left = new TreeNode(values[i]);
      queue.push(node.left);
    }
    i++;
    if (i < values.length && values[i] !== null) {
      node.right = new TreeNode(values[i]);
      queue.push(node.right);
    }
    i++;
  }
  return root;
}

const root = buildTree([3, 9, 20, null, null, 15, 7]);
console.log(root.val, root.left.val, root.right.left.val);  // 3 9 15
console.log(root.left.left);                                // null
```

### Preorder, inorder, postorder

Preorder visits the node before its children, inorder between them, postorder after them.

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(1, new TreeNode(2, new TreeNode(4), new TreeNode(5)), new TreeNode(3));
{{code}}
```

```javascript
function preorder(node, out = []) {
  if (node === null) return out;
  out.push(node.val);
  preorder(node.left, out);
  preorder(node.right, out);
  return out;
}

function inorder(node, out = []) {
  if (node === null) return out;
  inorder(node.left, out);
  out.push(node.val);
  inorder(node.right, out);
  return out;
}

function postorder(node, out = []) {
  if (node === null) return out;
  postorder(node.left, out);
  postorder(node.right, out);
  out.push(node.val);
  return out;
}

console.log(preorder(root).join(" "));   // 1 2 4 5 3
console.log(inorder(root).join(" "));    // 4 2 5 1 3
console.log(postorder(root).join(" "));  // 4 5 2 3 1
```

### Inorder and preorder with a stack

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(1, new TreeNode(2, new TreeNode(4), new TreeNode(5)), new TreeNode(3));
{{code}}
```

```javascript
const pre = [];
const stack = [root];
while (stack.length > 0) {
  const node = stack.pop();
  if (node === null) continue;
  pre.push(node.val);
  stack.push(node.right, node.left);  // right first, so left comes off first
}
console.log(pre.join(" "));  // 1 2 4 5 3

const ino = [];
const path = [];
let curr = root;
while (curr !== null || path.length > 0) {
  while (curr !== null) {             // go left as far as possible
    path.push(curr);
    curr = curr.left;
  }
  curr = path.pop();
  ino.push(curr.val);
  curr = curr.right;
}
console.log(ino.join(" "));  // 4 2 5 1 3
```

### Level order (BFS)

Keep the current level in an array, and build the next level from its children. Each round is one level, so its index is the depth.

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(3, new TreeNode(9), new TreeNode(20, new TreeNode(15), new TreeNode(7)));
{{code}}
```

```javascript
function levels(root) {
  const out = [];
  let level = root === null ? [] : [root];
  while (level.length > 0) {
    out.push(level.map((n) => n.val));
    const next = [];
    for (const n of level) {
      if (n.left !== null) next.push(n.left);
      if (n.right !== null) next.push(n.right);
    }
    level = next;
  }
  return out;
}
for (const row of levels(root)) console.log(row.join(" "));  // 3, then 9 20, then 15 7
console.log(levels(root).map((row) => row.at(-1)).join(" "));  // 3 20 7, the right side view
```

### Depth, size, and sum

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(3, new TreeNode(9), new TreeNode(20, new TreeNode(15), new TreeNode(7)));
{{code}}
```

```javascript
const maxDepth = (n) => (n === null ? 0 : 1 + Math.max(maxDepth(n.left), maxDepth(n.right)));
const size = (n) => (n === null ? 0 : 1 + size(n.left) + size(n.right));
const sum = (n) => (n === null ? 0 : n.val + sum(n.left) + sum(n.right));
console.log(maxDepth(root), size(root), sum(root));  // 3 5 54

let diameter = 0;  // the longest path in edges, through any node
function depth(n) {
  if (n === null) return 0;
  const l = depth(n.left);
  const r = depth(n.right);
  diameter = Math.max(diameter, l + r);
  return 1 + Math.max(l, r);
}
depth(root);
console.log(diameter);  // 3
```

### Binary search tree: insert, search, validate

Everything left of a node is smaller and everything right is larger, so an inorder walk comes out sorted.

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const inorder = (n, out = []) => (n === null ? out : (inorder(n.left, out), out.push(n.val), inorder(n.right, out)));
{{code}}
```

```javascript
function insert(node, val) {
  if (node === null) return new TreeNode(val);
  if (val < node.val) node.left = insert(node.left, val);
  else if (val > node.val) node.right = insert(node.right, val);  // equal: already there
  return node;
}

function contains(node, val) {
  while (node !== null) {
    if (val === node.val) return true;
    node = val < node.val ? node.left : node.right;
  }
  return false;
}

let root = null;
for (const v of [5, 3, 8, 1, 4, 9]) root = insert(root, v);
console.log(inorder(root).join(" "));              // 1 3 4 5 8 9
console.log(contains(root, 4), contains(root, 7));  // true false

function isValidBST(node, lo = -Infinity, hi = Infinity) {
  if (node === null) return true;
  if (node.val <= lo || node.val >= hi) return false;
  return isValidBST(node.left, lo, node.val) && isValidBST(node.right, node.val, hi);
}
console.log(isValidBST(root));  // true
console.log(isValidBST(new TreeNode(5, new TreeNode(1), new TreeNode(4))));  // false
```

### Lowest common ancestor in a BST

```javascript harness
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(6, new TreeNode(2, new TreeNode(0), new TreeNode(4)), new TreeNode(8, new TreeNode(7), new TreeNode(9)));
{{code}}
```

```javascript
function lca(node, p, q) {
  while (node !== null) {
    if (p < node.val && q < node.val) node = node.left;        // both on the left
    else if (p > node.val && q > node.val) node = node.right;  // both on the right
    else return node;                                          // they split here
  }
  return null;
}
console.log(lca(root, 0, 4).val, lca(root, 4, 7).val);  // 2 6
```

### Gotchas

- `if (!node.left)` is fine, but `if (!node.val)` is true for a node holding `0`. Compare the node with `null`, not its value.
- Recursion is about 10,000 calls deep at most here. A tree that is one long chain (sorted values inserted into a BST) can hit `RangeError: Maximum call stack size exceeded`, so use a stack or a loop there.
- Validate a BST with bounds passed down, not by checking each node against its children. `-Infinity` and `Infinity` are safe starting bounds, with no 32-bit limit to worry about.
- `console.log(root)` prints nested objects and cuts off below depth 2 (`[TreeNode]`). Print a traversal instead.
