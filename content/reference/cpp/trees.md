# Trees

A binary tree node holds a value and two child pointers, `left` and `right`, with `nullptr` where a child is missing. Most tree code is a short recursive function that handles `nullptr` first and then combines both subtrees. Breadth-first order uses a `std::queue` of node pointers.

### The node struct (LeetCode shape) and a builder

Problems give the tree in level order, `null` marking a missing child. Each real node takes the next two tokens as its children.

```stdin
3 9 20 null null 15 7
```

```cpp
#include <iostream>
#include <string>
#include <vector>

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};

TreeNode* buildTree(const std::vector<std::string>& tokens) {
    std::vector<TreeNode*> nodes;
    for (const std::string& t : tokens) {
        nodes.push_back(t == "null" ? nullptr : new TreeNode(std::stoi(t)));
    }
    std::size_t child = 1;
    for (TreeNode* node : nodes) {
        if (node != nullptr) {
            node->left = child < nodes.size() ? nodes[child] : nullptr;
            node->right = child + 1 < nodes.size() ? nodes[child + 1] : nullptr;
            child += 2;
        }
    }
    return nodes.empty() ? nullptr : nodes[0];
}

std::vector<std::string> tokens;
std::string token;
while (std::cin >> token) tokens.push_back(token);   // reads 3 9 20 null null 15 7
TreeNode* root = buildTree(tokens);
std::cout << root->val << ' ' << root->right->left->val << '\n';   // 3 15

TreeNode* small = new TreeNode(2);            // or link nodes by hand
small->left = new TreeNode(1);
small->right = new TreeNode(3);
std::cout << small->left->val << '\n';       // 1
```

### Preorder, inorder, postorder

```cpp harness
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} }; TreeNode* buildTree(const std::vector<std::string>& t) { std::vector<TreeNode*> n; for (const auto& s : t) n.push_back(s == "null" ? nullptr : new TreeNode(std::stoi(s))); std::size_t c = 1; for (TreeNode* x : n) if (x) { x->left = c < n.size() ? n[c] : nullptr; x->right = c + 1 < n.size() ? n[c + 1] : nullptr; c += 2; } return n.empty() ? nullptr : n[0]; }
TreeNode* root = buildTree({"1", "2", "3", "4", "5"});
{{code}}
```

```cpp
void preorder(TreeNode* node, std::vector<int>& out) {
    if (node == nullptr) return;
    out.push_back(node->val);      // node, then left, then right
    preorder(node->left, out);
    preorder(node->right, out);
}

void inorder(TreeNode* node, std::vector<int>& out) {
    if (node == nullptr) return;
    inorder(node->left, out);
    out.push_back(node->val);      // left, node, right: sorted for a BST
    inorder(node->right, out);
}

void postorder(TreeNode* node, std::vector<int>& out) {
    if (node == nullptr) return;
    postorder(node->left, out);
    postorder(node->right, out);
    out.push_back(node->val);      // children first: the order to free a tree in
}

std::vector<int> pre, in, post;    // root is 1, children 2 and 3, and 2 has 4 and 5
preorder(root, pre);
inorder(root, in);
postorder(root, post);
for (int x : pre) std::cout << x << ' ';    // 1 2 4 5 3
std::cout << '\n';
for (int x : in) std::cout << x << ' ';     // 4 2 5 1 3
std::cout << '\n';
for (int x : post) std::cout << x << ' ';   // 4 5 2 3 1
```

### Inorder and preorder with a stack

```cpp harness
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} }; TreeNode* buildTree(const std::vector<std::string>& t) { std::vector<TreeNode*> n; for (const auto& s : t) n.push_back(s == "null" ? nullptr : new TreeNode(std::stoi(s))); std::size_t c = 1; for (TreeNode* x : n) if (x) { x->left = c < n.size() ? n[c] : nullptr; x->right = c + 1 < n.size() ? n[c + 1] : nullptr; c += 2; } return n.empty() ? nullptr : n[0]; }
TreeNode* root = buildTree({"1", "2", "3", "4", "5"});
{{code}}
```

```cpp
#include <stack>

std::stack<TreeNode*> st;
TreeNode* cur = root;
while (cur != nullptr || !st.empty()) {
    while (cur != nullptr) {        // go as far left as you can
        st.push(cur);
        cur = cur->left;
    }
    cur = st.top();
    st.pop();
    std::cout << cur->val << ' ';   // 4 2 5 1 3, inorder
    cur = cur->right;
}
std::cout << '\n';

st.push(root);
while (!st.empty()) {
    TreeNode* node = st.top();
    st.pop();
    std::cout << node->val << ' ';  // 1 2 4 5 3, preorder
    if (node->right) st.push(node->right);   // right first, so left pops first
    if (node->left) st.push(node->left);
}
```

### Level order (BFS)

Save the queue's size before the inner loop: exactly that many nodes make up the current level.

```cpp harness
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} }; TreeNode* buildTree(const std::vector<std::string>& t) { std::vector<TreeNode*> n; for (const auto& s : t) n.push_back(s == "null" ? nullptr : new TreeNode(std::stoi(s))); std::size_t c = 1; for (TreeNode* x : n) if (x) { x->left = c < n.size() ? n[c] : nullptr; x->right = c + 1 < n.size() ? n[c + 1] : nullptr; c += 2; } return n.empty() ? nullptr : n[0]; }
TreeNode* root = buildTree({"3", "9", "20", "null", "null", "15", "7"});
{{code}}
```

```cpp
#include <queue>

std::queue<TreeNode*> q;
if (root != nullptr) q.push(root);
while (!q.empty()) {
    int size = static_cast<int>(q.size());   // this level only
    for (int i = 0; i < size; i++) {
        TreeNode* node = q.front();
        q.pop();
        std::cout << node->val << (i + 1 < size ? " " : "\n");
        if (node->left) q.push(node->left);
        if (node->right) q.push(node->right);
    }
}
// 3
// 9 20
// 15 7
```

### Depth, size, and sum

```cpp harness
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} }; TreeNode* buildTree(const std::vector<std::string>& t) { std::vector<TreeNode*> n; for (const auto& s : t) n.push_back(s == "null" ? nullptr : new TreeNode(std::stoi(s))); std::size_t c = 1; for (TreeNode* x : n) if (x) { x->left = c < n.size() ? n[c] : nullptr; x->right = c + 1 < n.size() ? n[c + 1] : nullptr; c += 2; } return n.empty() ? nullptr : n[0]; }
TreeNode* root = buildTree({"3", "9", "20", "null", "null", "15", "7"});
{{code}}
```

```cpp
#include <algorithm>

int maxDepth(TreeNode* node) {
    if (node == nullptr) return 0;                     // an empty tree has depth 0
    return 1 + std::max(maxDepth(node->left), maxDepth(node->right));
}

int countNodes(TreeNode* node) {
    return node == nullptr ? 0 : 1 + countNodes(node->left) + countNodes(node->right);
}

long long sumTree(TreeNode* node) {
    return node == nullptr ? 0 : node->val + sumTree(node->left) + sumTree(node->right);
}

void freeTree(TreeNode* node) {
    if (node == nullptr) return;
    freeTree(node->left);                              // postorder: children first
    freeTree(node->right);
    delete node;
}

std::cout << maxDepth(root) << ' ' << countNodes(root) << ' ' << sumTree(root) << '\n';   // 3 5 54
freeTree(root);
```

### Binary search tree: insert, search, validate

Smaller values go left and larger ones right, so search and insert walk one path, O(height). Inorder visits a BST in sorted order.

```cpp harness
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
void inorder(TreeNode* n, std::vector<int>& out) { if (!n) return; inorder(n->left, out); out.push_back(n->val); inorder(n->right, out); }
{{code}}
```

```cpp
#include <climits>   // LLONG_MIN, LLONG_MAX

TreeNode* insert(TreeNode* node, int x) {
    if (node == nullptr) return new TreeNode(x);       // the empty spot it belongs in
    if (x < node->val) node->left = insert(node->left, x);
    else if (x > node->val) node->right = insert(node->right, x);
    return node;                                       // equal: skip the duplicate
}

bool contains(TreeNode* node, int x) {
    while (node != nullptr) {
        if (x == node->val) return true;
        node = x < node->val ? node->left : node->right;
    }
    return false;
}

bool isValid(TreeNode* node, long long low, long long high) {   // long long: room past the int limits
    if (node == nullptr) return true;
    if (node->val <= low || node->val >= high) return false;
    return isValid(node->left, low, node->val) && isValid(node->right, node->val, high);
}

TreeNode* root = nullptr;
for (int x : {5, 3, 8, 1, 4, 9, 3}) root = insert(root, x);   // keep the returned root
std::vector<int> sorted;
inorder(root, sorted);                                         // the inorder from above
for (int x : sorted) std::cout << x << ' ';                   // 1 3 4 5 8 9
std::cout << '\n' << std::boolalpha << contains(root, 4) << ' ' << contains(root, 7) << '\n';   // true false
std::cout << isValid(root, LLONG_MIN, LLONG_MAX) << '\n';      // true
root->left->right->val = 6;                                    // 6 now sits left of 5
std::cout << isValid(root, LLONG_MIN, LLONG_MAX) << '\n';      // false
```

`std::set` and `std::map` are balanced binary search trees already. Write your own only when the problem asks for the tree.

### Costs

| Task | Cost |
|---|---|
| any traversal, depth, size | O(n) |
| BST search and insert | O(height): O(log n) balanced, O(n) for sorted input |
| BFS queue, recursion stack | O(width), O(height) |

### Gotchas

- Check `node == nullptr` first in every recursive function. It's the base case, and reading `node->left` through `nullptr` crashes.
- Inserting sorted values into a plain BST makes a chain, so recursion goes n levels deep and can overflow the stack on big inputs.
- Validating a BST against `INT_MIN` and `INT_MAX` fails when a node holds one of those values. Use `long long` bounds (from `<climits>`) or pass `TreeNode*` bounds.
- Checking only each node's direct children isn't enough to validate a BST. Every value in the left subtree must be smaller, so pass bounds down.
