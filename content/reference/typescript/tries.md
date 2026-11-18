# Tries with Map Children

A trie (prefix tree) stores words letter by letter: each node maps a character to a child node and marks whether a word ends there. Words that share a prefix share its nodes, so looking up a word or a prefix costs O(length of the word), however many words are stored. There's none built in, and a `Map<string, TrieNode>` makes the children. `children.get(ch)` is `TrieNode | undefined`, and that `undefined` is the "no such prefix" answer.

### The node and the trie

```typescript
class TrieNode {
  children = new Map<string, TrieNode>();
  isEnd = false;  // a word ends here
  count = 0;      // how many words pass through here
}

class Trie {
  #root = new TrieNode();

  insert(word: string): void {
    let node = this.#root;
    for (const ch of word) {
      let child = node.children.get(ch);
      if (child === undefined) {
        child = new TrieNode();
        node.children.set(ch, child);
      }
      child.count++;
      node = child;
    }
    node.isEnd = true;
  }

  search(word: string): boolean {
    return this.find(word)?.isEnd ?? false;
  }

  startsWith(prefix: string): boolean {
    return this.find(prefix) !== null;
  }

  countPrefix(prefix: string): number {
    return this.find(prefix)?.count ?? 0;
  }

  find(prefix: string): TrieNode | null {  // the node at the end of prefix, or null
    let node = this.#root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (child === undefined) return null;
      node = child;
    }
    return node;
  }
}

const trie = new Trie();
for (const w of ["apple", "app", "apply", "bat"]) trie.insert(w);
console.log(trie.search("app"), trie.search("appl"));         // true false
console.log(trie.startsWith("appl"), trie.startsWith("cat"));  // true false
console.log(trie.countPrefix("app"), trie.countPrefix("b"));   // 3 1
```

If the same word can be inserted twice, check `search(word)` first, or the counts grow twice.

### has, then get, doesn't narrow

`children.has(ch)` tells you nothing the checker keeps, so the `get` after it is still `TrieNode | undefined`. Read with `get` once and check that.

```typescript harness
class TrieNode {
  children = new Map<string, TrieNode>();
  isEnd = false;
}
const root = new TrieNode();
let node = root;
{{code}}
```

```typescript error
for (const ch of "cat") {
  if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
  node = node.children.get(ch); // TS2322: Type 'TrieNode | undefined' is not assignable to type 'TrieNode'.
}
```

### Children in an array of 26

For lowercase letters only, an array indexed by `charCodeAt(0) - 97` is a little faster, and walking it in index order visits children alphabetically. A slot reads as `Node26 | null | undefined`, so `?? null` folds the two empties into one.

```typescript
class Node26 {
  next = new Array<Node26 | null>(26).fill(null);
  isEnd = false;
}
const root = new Node26();
function insert(word: string): void {
  let node = root;
  for (const ch of word) {
    const i = ch.charCodeAt(0) - 97;  // "a" is 0
    let child = node.next[i] ?? null;
    if (child === null) {
      child = new Node26();
      node.next[i] = child;
    }
    node = child;
  }
  node.isEnd = true;
}
insert("cab");
insert("car");
const c = root.next[2] ?? null;
console.log(c !== null, c?.next[0]?.next[17]?.isEnd);  // true true, c then a then r
console.log(String.fromCharCode(97 + 17));            // r
```

### Wildcard search by DFS

A `.` matches any one letter, so at a dot try every child.

```typescript harness
class TrieNode {
  children = new Map<string, TrieNode>();
  isEnd = false;
}
const root = new TrieNode();
function addWord(word: string): void {
  let node = root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (child === undefined) {
      child = new TrieNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isEnd = true;
}
for (const w of ["bad", "dad", "mad"]) addWord(w);
{{code}}
```

```typescript
function matches(word: string, i = 0, node: TrieNode = root): boolean {
  if (i === word.length) return node.isEnd;
  const ch = word.charAt(i);
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

```typescript harness
class TrieNode {
  children = new Map<string, TrieNode>();
  isEnd = false;
}
const root = new TrieNode();
function addWord(word: string): void {
  let node = root;
  for (const ch of word) {
    let child = node.children.get(ch);
    if (child === undefined) {
      child = new TrieNode();
      node.children.set(ch, child);
    }
    node = child;
  }
  node.isEnd = true;
}
for (const w of ["car", "cat", "cart", "care", "dog", "ca"]) addWord(w);
{{code}}
```

```typescript
function wordsWithPrefix(prefix: string): string[] {
  let node = root;
  for (const ch of prefix) {
    const child = node.children.get(ch);
    if (child === undefined) return [];
    node = child;
  }
  const out: string[] = [];
  const walk = (n: TrieNode, word: string): void => {
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

### Costs

| Operation | Cost |
| --- | --- |
| `insert(word)`, `search(word)`, `startsWith(p)` | O(length) |
| `countPrefix(p)` with a count on each node | O(length of p) |
| every word under a prefix | O(nodes below it), plus the sort |
| memory | one node per distinct prefix |

### Gotchas

- `children.get(ch)` returns `undefined` for a missing child, not `null`. Check it with `=== undefined`, or the comparison never matches.
- `has` before `get` doesn't narrow, so `node = node.children.get(ch)` is TS2322 even right after a `has` check. Read once with `get` and check that.
- A `Map` of children iterates in insertion order, not alphabetical order. Sort what you collect, or use the array of 26 and walk it by index.
- `search` must check `isEnd`: after inserting `apple`, the path for `app` exists but `app` isn't a word until you insert it.
