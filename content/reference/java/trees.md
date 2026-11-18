# Trees

Problems hand you a `TreeNode`, and most answers are a short recursion on `left` and `right`: answer for `null`, then combine both sides. For a ready-made balanced search tree, use `TreeMap` or `TreeSet` (see Binary Search).

### The node class (LeetCode shape) and a builder

LeetCode writes a tree level by level, with `null` for a missing child: `[3, 9, 20, null, null, 15, 7]` is 3 with children 9 and 20, and 20 with children 15 and 7.

```java
class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

static TreeNode build(Integer... vals) {
    if (vals.length == 0 || vals[0] == null) {
        return null;
    }
    TreeNode root = new TreeNode(vals[0]);
    Queue<TreeNode> queue = new ArrayDeque<>();
    queue.offer(root);
    for (int i = 1; i < vals.length; i += 2) {
        TreeNode node = queue.poll();
        if (vals[i] != null) {
            node.left = new TreeNode(vals[i]);
            queue.offer(node.left);
        }
        if (i + 1 < vals.length && vals[i + 1] != null) {
            node.right = new TreeNode(vals[i + 1]);
            queue.offer(node.right);
        }
    }
    return root;
}

TreeNode small = new TreeNode(1, new TreeNode(2), null);
System.out.println(small.left.val + " " + small.right);  // 2 null
TreeNode root = build(3, 9, 20, null, null, 15, 7);
System.out.println(root.right.left.val);                 // 15
```

### Preorder, inorder, postorder

```java harness
class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }
static TreeNode build(Integer... v) { if (v.length == 0 || v[0] == null) return null; TreeNode r = new TreeNode(v[0]); Queue<TreeNode> q = new ArrayDeque<>(); q.offer(r); for (int i = 1; i < v.length; i += 2) { TreeNode n = q.poll(); if (v[i] != null) { n.left = new TreeNode(v[i]); q.offer(n.left); } if (i + 1 < v.length && v[i + 1] != null) { n.right = new TreeNode(v[i + 1]); q.offer(n.right); } } return r; }
{{code}}
```

```java
static void preorder(TreeNode node, List<Integer> out) {
    if (node == null) {
        return;
    }
    out.add(node.val);              // node, left, right
    preorder(node.left, out);
    preorder(node.right, out);
}

static void inorder(TreeNode node, List<Integer> out) {
    if (node == null) {
        return;
    }
    inorder(node.left, out);        // left, node, right
    out.add(node.val);
    inorder(node.right, out);
}

static void postorder(TreeNode node, List<Integer> out) {
    if (node == null) {
        return;
    }
    postorder(node.left, out);      // left, right, node
    postorder(node.right, out);
    out.add(node.val);
}

TreeNode root = build(4, 2, 6, 1, 3, 5, 7);
List<Integer> pre = new ArrayList<>();
List<Integer> in = new ArrayList<>();
List<Integer> post = new ArrayList<>();
preorder(root, pre);
inorder(root, in);
postorder(root, post);
System.out.println(pre);   // [4, 2, 1, 3, 6, 5, 7]
System.out.println(in);    // [1, 2, 3, 4, 5, 6, 7], sorted, since this is a BST
System.out.println(post);  // [1, 3, 2, 5, 7, 6, 4]
```

### Inorder and preorder with a stack

```java harness
class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }
static TreeNode build(Integer... v) { if (v.length == 0 || v[0] == null) return null; TreeNode r = new TreeNode(v[0]); Queue<TreeNode> q = new ArrayDeque<>(); q.offer(r); for (int i = 1; i < v.length; i += 2) { TreeNode n = q.poll(); if (v[i] != null) { n.left = new TreeNode(v[i]); q.offer(n.left); } if (i + 1 < v.length && v[i + 1] != null) { n.right = new TreeNode(v[i + 1]); q.offer(n.right); } } return r; }
{{code}}
```

```java
TreeNode root = build(4, 2, 6, 1, 3, 5, 7);
List<Integer> out = new ArrayList<>();
Deque<TreeNode> stack = new ArrayDeque<>();
TreeNode cur = root;
while (cur != null || !stack.isEmpty()) {
    while (cur != null) {
        stack.push(cur);            // go left as far as you can
        cur = cur.left;
    }
    cur = stack.pop();
    out.add(cur.val);
    cur = cur.right;
}
System.out.println(out); // [1, 2, 3, 4, 5, 6, 7]

List<Integer> pre = new ArrayList<>();
stack.push(root);
while (!stack.isEmpty()) {
    TreeNode node = stack.pop();
    pre.add(node.val);
    if (node.right != null) stack.push(node.right);   // right first, so left pops first
    if (node.left != null) stack.push(node.left);     // ArrayDeque takes no null
}
System.out.println(pre); // [4, 2, 1, 3, 6, 5, 7]
```

### Level order (BFS)

```java harness
class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }
static TreeNode build(Integer... v) { if (v.length == 0 || v[0] == null) return null; TreeNode r = new TreeNode(v[0]); Queue<TreeNode> q = new ArrayDeque<>(); q.offer(r); for (int i = 1; i < v.length; i += 2) { TreeNode n = q.poll(); if (v[i] != null) { n.left = new TreeNode(v[i]); q.offer(n.left); } if (i + 1 < v.length && v[i + 1] != null) { n.right = new TreeNode(v[i + 1]); q.offer(n.right); } } return r; }
{{code}}
```

```java
TreeNode root = build(3, 9, 20, null, null, 15, 7);
List<List<Integer>> levels = new ArrayList<>();
Queue<TreeNode> queue = new ArrayDeque<>();
if (root != null) {
    queue.offer(root);
}
while (!queue.isEmpty()) {
    int size = queue.size();        // how many nodes are on this level
    List<Integer> level = new ArrayList<>();
    for (int i = 0; i < size; i++) {
        TreeNode node = queue.poll();
        level.add(node.val);
        if (node.left != null) {
            queue.offer(node.left);
        }
        if (node.right != null) {
            queue.offer(node.right);
        }
    }
    levels.add(level);
}
System.out.println(levels); // [[3], [9, 20], [15, 7]]
```

### Depth, size, and sum

```java harness
class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }
static TreeNode build(Integer... v) { if (v.length == 0 || v[0] == null) return null; TreeNode r = new TreeNode(v[0]); Queue<TreeNode> q = new ArrayDeque<>(); q.offer(r); for (int i = 1; i < v.length; i += 2) { TreeNode n = q.poll(); if (v[i] != null) { n.left = new TreeNode(v[i]); q.offer(n.left); } if (i + 1 < v.length && v[i + 1] != null) { n.right = new TreeNode(v[i + 1]); q.offer(n.right); } } return r; }
{{code}}
```

```java
static int maxDepth(TreeNode node) {
    return node == null ? 0 : 1 + Math.max(maxDepth(node.left), maxDepth(node.right));
}

static int count(TreeNode node) {
    return node == null ? 0 : 1 + count(node.left) + count(node.right);
}

static int sum(TreeNode node) {
    return node == null ? 0 : node.val + sum(node.left) + sum(node.right);
}

TreeNode root = build(3, 9, 20, null, null, 15, 7);
System.out.println(maxDepth(root)); // 3
System.out.println(count(root));    // 5
System.out.println(sum(root));      // 54
```

### Binary search tree: insert, search, validate

Every value in a node's left subtree is smaller and every value in its right subtree is larger. To validate, pass down the range each node must fit, as `long` so a node holding `Integer.MAX_VALUE` still fits.

```java harness
class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }
static TreeNode build(Integer... v) { if (v.length == 0 || v[0] == null) return null; TreeNode r = new TreeNode(v[0]); Queue<TreeNode> q = new ArrayDeque<>(); q.offer(r); for (int i = 1; i < v.length; i += 2) { TreeNode n = q.poll(); if (v[i] != null) { n.left = new TreeNode(v[i]); q.offer(n.left); } if (i + 1 < v.length && v[i + 1] != null) { n.right = new TreeNode(v[i + 1]); q.offer(n.right); } } return r; }
{{code}}
```

```java
static TreeNode insert(TreeNode node, int val) {
    if (node == null) {
        return new TreeNode(val);
    }
    if (val < node.val) {
        node.left = insert(node.left, val);
    } else if (val > node.val) {
        node.right = insert(node.right, val);
    }
    return node;                             // an equal value is already there
}

static boolean contains(TreeNode node, int val) {
    while (node != null && node.val != val) {
        node = val < node.val ? node.left : node.right;
    }
    return node != null;
}

static boolean isValid(TreeNode node, long low, long high) {
    if (node == null) {
        return true;
    }
    if (node.val <= low || node.val >= high) {
        return false;
    }
    return isValid(node.left, low, node.val) && isValid(node.right, node.val, high);
}

TreeNode root = null;
for (int v : new int[]{5, 3, 8, 1, 4}) {
    root = insert(root, v);                  // always store the result
}
System.out.println(contains(root, 4) + " " + contains(root, 7));         // true false
System.out.println(isValid(root, Long.MIN_VALUE, Long.MAX_VALUE));       // true
TreeNode bad = build(5, 1, 6, null, null, 3, 7);                         // 3 sits right of 5
System.out.println(isValid(bad, Long.MIN_VALUE, Long.MAX_VALUE));        // false
```

### Gotchas

- Check `node == null` first in every recursive method, or `node.left` throws `NullPointerException`.
- Validating with `int` bounds starting at `Integer.MIN_VALUE` and `Integer.MAX_VALUE` wrongly rejects a node holding those values. Use `long` bounds or `Integer` bounds that start `null`.
- `ArrayDeque` rejects `null`, so offer a child only when it isn't `null`.
- A tree built from sorted inserts is a one-sided chain, and recursion down a chain of about 10,000 nodes overflows the stack.
