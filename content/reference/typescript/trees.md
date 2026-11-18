# Trees with TreeNode

There's no tree type built in, so you write the node class. LeetCode's TypeScript one is `TreeNode` with `val: number` and `left` and `right` typed `TreeNode | null`. Problems give a tree in level order with `null` gaps (`[3, 9, 20, null, null, 15, 7]`), so the input is a `(number | null)[]`. Most answers are a short recursion that starts with `if (node === null)`, after which the checker knows `node` is a `TreeNode`.

### The node class (LeetCode shape) and a builder

Each non-null value in level order takes the next two values as its children, so the builder hands them out in turn.

```typescript
class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;

  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

function buildTree(values: readonly (number | null)[]): TreeNode | null {
  const nodes = values.map((v) => (v === null ? null : new TreeNode(v)));
  let child = 1;
  for (const node of nodes) {
    if (node === null) continue;
    node.left = nodes[child] ?? null;  // past the end reads undefined: no child
    node.right = nodes[child + 1] ?? null;
    child += 2;
  }
  return nodes[0] ?? null;
}

const root = buildTree([3, 9, 20, null, null, 15, 7]);
console.log(root?.val, root?.left?.val, root?.right?.left?.val);  // 3 9 15
console.log(root?.left?.left, buildTree([null]));                  // null null
```

### Preorder, inorder, postorder

Preorder visits the node before its children, inorder between them, postorder after them. A default `out: number[] = []` collects the values.

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(1, new TreeNode(2, new TreeNode(4), new TreeNode(5)), new TreeNode(3));
{{code}}
```

```typescript
function preorder(node: TreeNode | null, out: number[] = []): number[] {
  if (node === null) return out;
  out.push(node.val);
  preorder(node.left, out);
  preorder(node.right, out);
  return out;
}

function inorder(node: TreeNode | null, out: number[] = []): number[] {
  if (node === null) return out;
  inorder(node.left, out);
  out.push(node.val);
  inorder(node.right, out);
  return out;
}

function postorder(node: TreeNode | null, out: number[] = []): number[] {
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

Push only real children, so the stack is a `TreeNode[]` and `pop()` returning `undefined` means it's empty.

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(1, new TreeNode(2, new TreeNode(4), new TreeNode(5)), new TreeNode(3));
{{code}}
```

```typescript
const pre: number[] = [];
const stack: TreeNode[] = [root];
for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
  pre.push(node.val);
  if (node.right !== null) stack.push(node.right);  // right first, so left comes off first
  if (node.left !== null) stack.push(node.left);
}
console.log(pre.join(" "));  // 1 2 4 5 3

const ino: number[] = [];
const path: TreeNode[] = [];
let curr: TreeNode | null = root;
while (curr !== null || path.length > 0) {
  while (curr !== null) {  // go left as far as possible
    path.push(curr);
    curr = curr.left;
  }
  const node = path.pop();
  if (node === undefined) break;
  ino.push(node.val);
  curr = node.right;
}
console.log(ino.join(" "));  // 4 2 5 1 3
```

### Level order (BFS)

Keep the current level in a `TreeNode[]`, and build the next level from its children. Each round is one level, so its index is the depth.

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(3, new TreeNode(9), new TreeNode(20, new TreeNode(15), new TreeNode(7)));
{{code}}
```

```typescript
function levels(root: TreeNode | null): number[][] {
  const out: number[][] = [];
  let level: TreeNode[] = root === null ? [] : [root];
  while (level.length > 0) {
    out.push(level.map((n) => n.val));
    const next: TreeNode[] = [];
    for (const n of level) {
      if (n.left !== null) next.push(n.left);
      if (n.right !== null) next.push(n.right);
    }
    level = next;
  }
  return out;
}
for (const row of levels(root)) console.log(row.join(" "));    // 3, then 9 20, then 15 7
console.log(levels(root).map((row) => row.at(-1)).join(" "));  // 3 20 7, the right side view
```

### Depth, size, and sum

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(3, new TreeNode(9), new TreeNode(20, new TreeNode(15), new TreeNode(7)));
{{code}}
```

```typescript
const maxDepth = (n: TreeNode | null): number => (n === null ? 0 : 1 + Math.max(maxDepth(n.left), maxDepth(n.right)));
const size = (n: TreeNode | null): number => (n === null ? 0 : 1 + size(n.left) + size(n.right));
const sum = (n: TreeNode | null): number => (n === null ? 0 : n.val + sum(n.left) + sum(n.right));
console.log(maxDepth(root), size(root), sum(root));  // 3 5 54

let diameter = 0;  // the longest path in edges, through any node
function depth(n: TreeNode | null): number {
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

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const inorder = (n: TreeNode | null, out: number[] = []): number[] => { if (n !== null) { inorder(n.left, out); out.push(n.val); inorder(n.right, out); } return out; };
{{code}}
```

```typescript
function insert(node: TreeNode | null, val: number): TreeNode {
  if (node === null) return new TreeNode(val);
  if (val < node.val) node.left = insert(node.left, val);
  else if (val > node.val) node.right = insert(node.right, val);  // equal: already there
  return node;
}

function contains(root: TreeNode | null, val: number): boolean {
  for (let node = root; node !== null; node = val < node.val ? node.left : node.right) {
    if (val === node.val) return true;
  }
  return false;
}

let root: TreeNode | null = null;
for (const v of [5, 3, 8, 1, 4, 9]) root = insert(root, v);
console.log(inorder(root).join(" "));               // 1 3 4 5 8 9
console.log(contains(root, 4), contains(root, 7));  // true false

function isValidBST(node: TreeNode | null, lo = -Infinity, hi = Infinity): boolean {
  if (node === null) return true;
  if (node.val <= lo || node.val >= hi) return false;
  return isValidBST(node.left, lo, node.val) && isValidBST(node.right, node.val, hi);
}
console.log(isValidBST(root));                                               // true
console.log(isValidBST(new TreeNode(5, new TreeNode(1), new TreeNode(4))));  // false
```

### Lowest common ancestor in a BST

```typescript harness
class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) { this.val = val; this.left = left; this.right = right; } }
const root = new TreeNode(6, new TreeNode(2, new TreeNode(0), new TreeNode(4)), new TreeNode(8, new TreeNode(7), new TreeNode(9)));
{{code}}
```

```typescript
function lca(root: TreeNode | null, p: number, q: number): TreeNode | null {
  let node = root;
  while (node !== null) {
    if (p < node.val && q < node.val) node = node.left;        // both on the left
    else if (p > node.val && q > node.val) node = node.right;  // both on the right
    else return node;                                          // they split here
  }
  return null;
}
console.log(lca(root, 0, 4)?.val, lca(root, 4, 7)?.val);  // 2 6
```

### Gotchas

- `root.left.val` is TS18047 until you check `root.left`. Return early on `null`, or read with `?.` where a missing node has an answer (`root?.left?.val` is `undefined`).
- `if (!node.val)` is true for a node holding `0`. Compare the node with `null`, not its value.
- Recursion is about 9,000 calls deep at most here. A tree that is one long chain (sorted values inserted into a BST) can hit `RangeError: Maximum call stack size exceeded`, so use a stack there.
- Validate a BST with bounds passed down, not by checking each node against its children. `-Infinity` and `Infinity` are safe starting bounds, with no 32-bit limit to worry about.
