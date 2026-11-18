# Tries

A trie (prefix tree) stores words letter by letter: each node maps a character to a child node and marks whether a word ends there. Words that share a prefix share its nodes, so looking up a word or a prefix costs O(length of the word), however many words are stored. JavaScript has none built in, and a `Map` makes the children.

### The node and the trie

```javascript
class TrieNode {
  constructor() {
    this.children = new Map();  // character to TrieNode
    this.isEnd = false;         // a word ends here
    this.count = 0;             // how many words pass through here
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
      node.count++;
    }
    node.isEnd = true;
  }

  find(prefix) {  // the node at the end of prefix, or null
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }

  search(word) {
    const node = this.find(word);
    return node !== null && node.isEnd;
  }

  startsWith(prefix) {
    return this.find(prefix) !== null;
  }

  countPrefix(prefix) {
    const node = this.find(prefix);
    return node === null ? 0 : node.count;
  }
}

const trie = new Trie();
for (const w of ["apple", "app", "apply", "bat"]) trie.insert(w);
console.log(trie.search("app"), trie.search("appl"));         // true false
console.log(trie.startsWith("appl"), trie.startsWith("cat"));  // true false
console.log(trie.countPrefix("app"), trie.countPrefix("b"));   // 3 1
```

If the same word can be inserted twice, check `search(word)` first, or the counts grow twice.

### Children in an array of 26

For lowercase letters only, an array indexed by `charCodeAt(0) - 97` is a little faster, and walking it in index order visits children alphabetically.

```javascript
class Node26 {
  constructor() {
    this.next = new Array(26).fill(null);
    this.isEnd = false;
  }
}
const root = new Node26();
function insert(word) {
  let node = root;
  for (const ch of word) {
    const i = ch.charCodeAt(0) - 97;  // "a" is 0
    if (node.next[i] === null) node.next[i] = new Node26();
    node = node.next[i];
  }
  node.isEnd = true;
}
insert("cab");
insert("car");
const c = root.next[2];
console.log(c !== null, c.next[0].next[17].isEnd);  // true true, c then a then r
console.log(String.fromCharCode(97 + 17));          // r
```

### Wildcard search by DFS

A `.` matches any one letter, so at a dot try every child.

```javascript harness
class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEnd = false;
  }
}
const root = new TrieNode();
function addWord(word) {
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
    node = node.children.get(ch);
  }
  node.isEnd = true;
}
for (const w of ["bad", "dad", "mad"]) addWord(w);
{{code}}
```

```javascript
function matches(word, i = 0, node = root) {
  if (i === word.length) return node.isEnd;
  const ch = word[i];
  if (ch === ".") {
    for (const child of node.children.values()) {
      if (matches(word, i + 1, child)) return true;
    }
    return false;
  }
  const child = node.children.get(ch);
  return child !== undefined && matches(word, i + 1, child);
}
console.log(matches("pad"), matches("bad"), matches(".ad"), matches("b.."), matches("b."));  // false true true true false
```

### Every word under a prefix

Walk to the prefix's node, then DFS below it, building each word on the way down. Sort the result, since a `Map` iterates in insertion order, not alphabetical order.

```javascript harness
class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEnd = false;
  }
}
const root = new TrieNode();
function addWord(word) {
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
    node = node.children.get(ch);
  }
  node.isEnd = true;
}
for (const w of ["car", "cat", "cart", "care", "dog", "ca"]) addWord(w);
{{code}}
```

```javascript
function wordsWithPrefix(prefix) {
  let node = root;
  for (const ch of prefix) {
    node = node.children.get(ch);
    if (node === undefined) return [];
  }
  const out = [];
  const walk = (n, word) => {
    if (n.isEnd) out.push(word);
    for (const [ch, child] of n.children) walk(child, word + ch);
  };
  walk(node, prefix);
  return out.sort();
}
console.log(wordsWithPrefix("car").join(" "));  // car care cart
console.log(wordsWithPrefix("ca").join(" "));   // ca car care cart cat
console.log(wordsWithPrefix("x").length);       // 0
```

### Shortest root that replaces a word

Walk the word through the trie and stop at the first node that ends a root.

```javascript
const roots = new Map();  // a trie as nested Maps, with "$" marking a word's end
for (const r of ["cat", "bat", "rat"]) {
  let node = roots;
  for (const ch of r) {
    if (!node.has(ch)) node.set(ch, new Map());
    node = node.get(ch);
  }
  node.set("$", true);
}
function shortestRoot(word) {
  let node = roots;
  for (let i = 0; i < word.length; i++) {
    node = node.get(word[i]);
    if (node === undefined) return word;  // no root fits
    if (node.has("$")) return word.slice(0, i + 1);
  }
  return word;
}
console.log("the cattle was rattled by the battery".split(" ").map(shortestRoot).join(" "));  // the cat was rat by the bat
```

### Costs

| Operation | Cost |
| --- | --- |
| `insert(word)`, `search(word)`, `startsWith(p)` | O(length) |
| `countPrefix(p)` with a count on each node | O(length of p) |
| every word under a prefix | O(nodes below it), plus the sort |
| memory | one node per distinct prefix |

### Gotchas

- `node.children.get(ch)` returns `undefined` for a missing child, not `null`. Compare with the right one, or test `has` first.
- A `Map` of children iterates in insertion order, not alphabetical order. Sort what you collect, or use the array of 26 and walk it by index.
- `search` must check `isEnd`: after inserting `apple`, the path for `app` exists but `app` isn't a word until you insert it.
- Deep tries recurse once per letter. Words of normal length are fine, but a DFS over a 100,000-letter string overflows the stack.
