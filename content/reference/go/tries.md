# Tries

A trie stores words as paths of letters from a root node, so words that start the same way share the start of their path. Go has no trie type: for lowercase words a node holds `children [26]*TrieNode` and a flag for "a word ends here", and a `map[rune]*TrieNode` handles any characters. Insert, search, and prefix checks take one step per letter.

### The node, insert, search, and starts with

```go
type TrieNode struct {
	children [26]*TrieNode // nil: no word continues with that letter
	isWord   bool          // a word ends at this node
	count    int           // how many words pass through this node
}

func (t *TrieNode) Insert(word string) {
	node := t
	for i := 0; i < len(word); i++ {
		c := word[i] - 'a' // 'a' is 0, 'z' is 25
		if node.children[c] == nil {
			node.children[c] = &TrieNode{}
		}
		node = node.children[c]
		node.count++
	}
	node.isWord = true
}

// find follows prefix down from t, or returns nil when the path runs out.
func (t *TrieNode) find(prefix string) *TrieNode {
	node := t
	for i := 0; i < len(prefix) && node != nil; i++ {
		node = node.children[prefix[i]-'a']
	}
	return node
}

func (t *TrieNode) Search(word string) bool {
	node := t.find(word)
	return node != nil && node.isWord // the path alone only proves a prefix
}

func (t *TrieNode) StartsWith(prefix string) bool { return t.find(prefix) != nil }

func (t *TrieNode) CountPrefix(prefix string) int {
	if node := t.find(prefix); node != nil {
		return node.count
	}
	return 0
}

trie := &TrieNode{} // the root holds no letter
for _, w := range []string{"apple", "app", "apt", "bat"} {
	trie.Insert(w)
}
fmt.Println(trie.Search("app"), trie.Search("ap"))         // true false
fmt.Println(trie.StartsWith("ap"), trie.StartsWith("c"))   // true false
fmt.Println(trie.CountPrefix("ap"), trie.CountPrefix("x")) // 3 0
```

### Wildcard search by DFS

A `.` matches any letter, so at a dot the search tries every child. `trie` is the one built above, holding apple, app, apt, and bat.

```go harness
type TrieNode struct {
	children [26]*TrieNode
	isWord   bool
	count    int
}

func (t *TrieNode) Insert(word string) {
	node := t
	for i := 0; i < len(word); i++ {
		c := word[i] - 'a'
		if node.children[c] == nil {
			node.children[c] = &TrieNode{}
		}
		node = node.children[c]
		node.count++
	}
	node.isWord = true
}

trie := &TrieNode{}
for _, w := range []string{"apple", "app", "apt", "bat"} {
	trie.Insert(w)
}
{{code}}
```

```go
func match(node *TrieNode, pattern string, i int) bool {
	if node == nil {
		return false
	}
	if i == len(pattern) {
		return node.isWord
	}
	if pattern[i] == '.' {
		for _, child := range node.children {
			if match(child, pattern, i+1) { // a nil child returns false at once
				return true
			}
		}
		return false
	}
	return match(node.children[pattern[i]-'a'], pattern, i+1)
}

fmt.Println(match(trie, ".pp", 0), match(trie, "b.t", 0), match(trie, "....", 0)) // true true false
```

### Every word under a prefix (autocomplete)

The children go from `a` to `z`, so a depth-first walk finds the words in sorted order.

```go harness
type TrieNode struct {
	children [26]*TrieNode
	isWord   bool
	count    int
}

func (t *TrieNode) Insert(word string) {
	node := t
	for i := 0; i < len(word); i++ {
		c := word[i] - 'a'
		if node.children[c] == nil {
			node.children[c] = &TrieNode{}
		}
		node = node.children[c]
		node.count++
	}
	node.isWord = true
}

func (t *TrieNode) find(prefix string) *TrieNode {
	node := t
	for i := 0; i < len(prefix) && node != nil; i++ {
		node = node.children[prefix[i]-'a']
	}
	return node
}

trie := &TrieNode{}
for _, w := range []string{"apple", "app", "apt", "bat"} {
	trie.Insert(w)
}
{{code}}
```

```go
func collect(node *TrieNode, path []byte, out *[]string) {
	if node.isWord {
		*out = append(*out, string(path)) // string(path) copies the bytes
	}
	for c, child := range node.children {
		if child != nil {
			collect(child, append(path, byte('a'+c)), out)
		}
	}
}

words := []string{}
if node := trie.find("ap"); node != nil {
	collect(node, []byte("ap"), &words)
}
fmt.Println(words) // [app apple apt]
```

### Children in a map, for any characters

```go
import "sort"

type Node struct {
	children map[rune]*Node
	isWord   bool
}

func newNode() *Node { return &Node{children: map[rune]*Node{}} }

func insert(root *Node, word string) {
	node := root
	for _, r := range word { // runes, so accents and symbols work
		next, ok := node.children[r]
		if !ok {
			next = newNode()
			node.children[r] = next
		}
		node = next
	}
	node.isWord = true
}

root := newNode()
for _, w := range []string{"héllo", "Hi!", "hey"} {
	insert(root, w)
}
first := []string{}
for r := range root.children {
	first = append(first, string(r))
}
sort.Strings(first) // map order is random, so sort before printing
fmt.Println(first)  // [H h]
```

### Costs

| Operation | Cost |
| --- | --- |
| insert, search, starts with | O(L) for a word of length L |
| count by prefix, with a `count` per node | O(L) |
| list every word under a prefix | O(L + the size of that subtree) |
| memory | one node per new letter, 26 pointers each with an array |

### Gotchas

- `word[i]-'a'` only works for `a` to `z`. For `'A'` the byte wraps around to 224 and indexing panics with index out of range. Lower the word first with `strings.ToLower`, or use a map of children.
- `Search` must check `isWord`. Reaching the last node only proves a prefix: `ap` starts `apple` but isn't a word.
- A `count` raised on every insert counts a repeated word twice. Check `Search` first when words can repeat.
- `string(c)` on an `int` makes a one-character string, not digits, and `'a'+c` is an `int` when `c` is. Write `byte('a'+c)` or `string(rune('a'+c))`.
