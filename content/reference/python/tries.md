# Tries

A trie (a prefix tree) stores words one letter per level, so words that share a prefix share its nodes. Insert, search, and starts-with take time proportional to the word's length, however many words it holds. Python has none built in: write a node with a dict of children and a flag for "a word ends here".

### The node and the trie

```python
class TrieNode:
    def __init__(self):
        self.children = {}            # letter -> TrieNode
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def _walk(self, prefix):          # the node for prefix, or None
        node = self.root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def search(self, word):
        node = self._walk(word)
        return node is not None and node.is_end

    def starts_with(self, prefix):
        return self._walk(prefix) is not None

trie = Trie()
for w in ["apple", "app", "bat"]:
    trie.insert(w)
print(trie.search("app"), trie.search("ap"))          # True False
print(trie.starts_with("ap"), trie.starts_with("c"))  # True False
```

### Count words by prefix

Keep a count on each node of how many inserted words pass through it.

```python
class CountNode:
    def __init__(self):
        self.children = {}
        self.count = 0                # words that pass through here
        self.ends = 0                 # words that end here

def insert(root, word):
    node = root
    for ch in word:
        node = node.children.setdefault(ch, CountNode())
        node.count += 1
    node.ends += 1

def count_prefix(root, prefix):
    node = root
    for ch in prefix:
        node = node.children.get(ch)
        if node is None:
            return 0
    return node.count

root = CountNode()
for w in ["apple", "app", "apt", "bat", "app"]:
    insert(root, w)
print(count_prefix(root, "ap"), count_prefix(root, "app"), count_prefix(root, "c"))   # 4 3 0
```

### Wildcard search by DFS

`.` matches any one letter, so at a `.` try every child.

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class WordDictionary:
    def __init__(self):
        self.root = TrieNode()

    def add_word(self, word):
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.is_end = True

    def search(self, word):
        def dfs(node, i):
            if i == len(word):
                return node.is_end
            if word[i] == ".":
                return any(dfs(child, i + 1) for child in node.children.values())
            child = node.children.get(word[i])
            return child is not None and dfs(child, i + 1)
        return dfs(self.root, 0)

wd = WordDictionary()
for w in ["bad", "dad", "mad"]:
    wd.add_word(w)
print(wd.search("pad"), wd.search("bad"), wd.search(".ad"), wd.search("b.."))   # False True True True
```

### Every word under a prefix

Walk to the prefix's node, then collect every word below it. Sort the children for alphabetical output.

```python harness
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False
root = TrieNode()
for w in ["car", "cart", "care", "cat", "dog"]:
    node = root
    for ch in w:
        node = node.children.setdefault(ch, TrieNode())
    node.is_end = True
{{code}}
```

```python
def words_with_prefix(root, prefix):
    node = root
    for ch in prefix:
        node = node.children.get(ch)
        if node is None:
            return []
    out = []
    def collect(node, path):
        if node.is_end:
            out.append(path)
        for ch in sorted(node.children):
            collect(node.children[ch], path + ch)
    collect(node, prefix)
    return out

print(words_with_prefix(root, "car"))   # ['car', 'care', 'cart']
print(words_with_prefix(root, "z"))     # []
```

### Children as a list of 26

For lowercase letters only, a list indexed by `ord(ch) - ord("a")` works too, and its children come out in alphabetical order.

```python
class Node26:
    def __init__(self):
        self.children = [None] * 26
        self.is_end = False

root = Node26()
for word in ["cab", "ca"]:
    node = root
    for ch in word:
        i = ord(ch) - ord("a")
        if node.children[i] is None:
            node.children[i] = Node26()
        node = node.children[i]
    node.is_end = True
ca = root.children[2].children[0]
print(ca.is_end, [chr(i + ord("a")) for i, c in enumerate(ca.children) if c])   # True ['b']
```

### Nested dicts, the short form

```python
END = "$"
root = {}
for word in ["car", "cat"]:
    node = root
    for ch in word:
        node = node.setdefault(ch, {})
    node[END] = True
print(root)              # {'c': {'a': {'r': {'$': True}, 't': {'$': True}}}}
print(END in root["c"]["a"]["t"])   # True  "cat" is a word
```

### Costs

| Operation | Cost |
| --- | --- |
| `insert`, `search`, `starts_with` | O(L), L the word's length |
| count words under a prefix (with counts on nodes) | O(L) |
| list the words under a prefix | O(L) plus the size of that subtree |
| memory | one node per distinct prefix |

### Gotchas

- `search` must check `is_end`. Without it, every prefix of a word counts as a word ("ap" in "apple").
- `children.setdefault(ch, TrieNode())` builds a new node on every call, even when `ch` is already there. It's fine for small inputs, and `if ch not in children` skips the waste.
- Dict children loop in insertion order. Sort the keys when the output must be alphabetical.
- A word inserted twice should still be one word for `search`, but counts twice in a prefix count. Decide which the problem wants.
