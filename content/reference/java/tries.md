# Tries

A trie stores words letter by letter, so words that share a prefix share the same path from the root. Java has none built in: write a node with 26 children for lowercase words, or a `Map` of children for any characters. Insert and search take O(L), where L is the word's length.

### The node and the trie

```java
class TrieNode {
    TrieNode[] children = new TrieNode[26];  // 'a' to 'z', null when missing
    boolean isWord;                           // a word ends here
    int count;                                // how many words pass through here
}

class Trie {
    private final TrieNode root = new TrieNode();

    void insert(String word) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            int i = c - 'a';
            if (node.children[i] == null) {
                node.children[i] = new TrieNode();
            }
            node = node.children[i];
            node.count++;
        }
        node.isWord = true;
    }

    private TrieNode find(String prefix) {    // the node where prefix ends, or null
        TrieNode node = root;
        for (char c : prefix.toCharArray()) {
            node = node.children[c - 'a'];
            if (node == null) {
                return null;
            }
        }
        return node;
    }

    boolean search(String word) {
        TrieNode node = find(word);
        return node != null && node.isWord;
    }

    boolean startsWith(String prefix) {
        return find(prefix) != null;
    }

    int countPrefix(String prefix) {
        TrieNode node = find(prefix);
        return node == null ? 0 : node.count;
    }
}

Trie trie = new Trie();
for (String w : new String[]{"apple", "app", "apt", "bat"}) {
    trie.insert(w);
}
System.out.println(trie.search("app"));      // true
System.out.println(trie.search("ap"));       // false, only a prefix
System.out.println(trie.startsWith("ap"));   // true
System.out.println(trie.countPrefix("ap"));  // 3: apple, app, apt
System.out.println(trie.countPrefix("c"));   // 0
```

### Children in a map, for any characters

A `TreeMap` keeps the children sorted, and `computeIfAbsent` creates a child the first time you need it.

```java
import java.util.Map;
import java.util.TreeMap;

class Node {
    Map<Character, Node> children = new TreeMap<>();
    boolean isWord;
}

Node root = new Node();
for (String w : new String[]{"Hi!", "Hey"}) {
    Node node = root;
    for (char c : w.toCharArray()) {
        node = node.children.computeIfAbsent(c, k -> new Node());
    }
    node.isWord = true;
}
System.out.println(root.children.keySet());                 // [H]
System.out.println(root.children.get('H').children.keySet()); // [e, i]
```

### Wildcard search by DFS

A `.` matches any one letter, so at a dot try every child.

```java harness
class TrieNode { TrieNode[] children = new TrieNode[26]; boolean isWord; int count; }
static void insert(TrieNode root, String w) { TrieNode n = root; for (char c : w.toCharArray()) { if (n.children[c - 'a'] == null) n.children[c - 'a'] = new TrieNode(); n = n.children[c - 'a']; n.count++; } n.isWord = true; }
TrieNode root = new TrieNode();
for (String w : new String[]{"bad", "dad", "mad"}) insert(root, w);
{{code}}
```

```java
static boolean matches(TrieNode node, String word, int i) {
    if (node == null) {
        return false;
    }
    if (i == word.length()) {
        return node.isWord;
    }
    char c = word.charAt(i);
    if (c != '.') {
        return matches(node.children[c - 'a'], word, i + 1);
    }
    for (TrieNode child : node.children) {
        if (matches(child, word, i + 1)) {
            return true;
        }
    }
    return false;
}

System.out.println(matches(root, ".ad", 0)); // true
System.out.println(matches(root, "b..", 0)); // true
System.out.println(matches(root, "b.", 0));  // false, too short
System.out.println(matches(root, "..x", 0)); // false
```

### Every word under a prefix

Walk to the prefix's node, then DFS below it. Visiting children 0 to 25 lists the words from a to z.

```java harness
class TrieNode { TrieNode[] children = new TrieNode[26]; boolean isWord; int count; }
static void insert(TrieNode root, String w) { TrieNode n = root; for (char c : w.toCharArray()) { if (n.children[c - 'a'] == null) n.children[c - 'a'] = new TrieNode(); n = n.children[c - 'a']; n.count++; } n.isWord = true; }
TrieNode root = new TrieNode();
for (String w : new String[]{"apt", "apple", "bat", "app"}) insert(root, w);
{{code}}
```

```java
static void collect(TrieNode node, StringBuilder path, List<String> out) {
    if (node.isWord) {
        out.add(path.toString());
    }
    for (int i = 0; i < 26; i++) {
        if (node.children[i] != null) {
            path.append((char) ('a' + i));
            collect(node.children[i], path, out);
            path.deleteCharAt(path.length() - 1);   // undo the letter
        }
    }
}

TrieNode node = root;
for (char c : "ap".toCharArray()) {
    node = node.children[c - 'a'];                  // assumes the prefix exists
}
List<String> words = new ArrayList<>();
collect(node, new StringBuilder("ap"), words);
System.out.println(words); // [app, apple, apt]
```

### Costs

| Operation | Cost |
| --- | --- |
| `insert`, `search`, `startsWith` | O(L) for a word of length L |
| every word under a prefix | O(the size of that part of the trie) |
| memory, array children | 26 references per node |

### Gotchas

- `c - 'a'` only works for `a` to `z`. An uppercase letter or a digit gives an index outside 0 to 25 and throws `ArrayIndexOutOfBoundsException`. Lowercase first, or use a `Map` of children.
- `search` must check `isWord`. Reaching the last node only proves the prefix exists: `ap` starts `apple` but isn't a word.
- A `count` raised on every insert counts a repeated word twice. Check `search` first if words can repeat.
- `path.append('a' + i)` appends a number, since `'a' + i` is an `int`. Cast it: `(char) ('a' + i)`.
