# Tries

A trie stores words letter by letter down a tree: each node has one child per next letter and a flag for "a word ends here". Insert, search, and prefix checks cost O(length of the word), however many words it holds. C++ has none built in, so you write the node yourself, with an array of 26 children for lowercase words or an `unordered_map` for any characters.

### The node and the trie

```cpp
#include <string>

struct TrieNode {
    TrieNode* children[26] = {};   // all nullptr to start
    bool isEnd = false;            // a word ends at this node
    int count = 0;                 // how many words pass through here
    ~TrieNode() {
        for (TrieNode* child : children) delete child;   // deleting nullptr is fine
    }
};

class Trie {
public:
    void insert(const std::string& word) {
        TrieNode* node = &root;
        for (char c : word) {
            int i = c - 'a';                                // 'a' is 0, 'z' is 25
            if (node->children[i] == nullptr) node->children[i] = new TrieNode();
            node = node->children[i];
            node->count++;
        }
        node->isEnd = true;
    }
    bool search(const std::string& word) const {
        const TrieNode* node = walk(word);
        return node != nullptr && node->isEnd;              // the whole word, not just a prefix
    }
    bool startsWith(const std::string& prefix) const {
        return walk(prefix) != nullptr;
    }
    int countPrefix(const std::string& prefix) const {
        const TrieNode* node = walk(prefix);
        return node == nullptr ? 0 : node->count;
    }

private:
    TrieNode root;                                          // the empty prefix
    const TrieNode* walk(const std::string& s) const {      // the node for s, or nullptr
        const TrieNode* node = &root;
        for (char c : s) {
            node = node->children[c - 'a'];
            if (node == nullptr) return nullptr;
        }
        return node;
    }
};

Trie trie;
for (const char* w : {"apple", "app", "apt", "bat"}) trie.insert(w);
std::cout << std::boolalpha;
std::cout << trie.search("app") << ' ' << trie.search("ap") << '\n';         // true false
std::cout << trie.startsWith("ap") << ' ' << trie.startsWith("c") << '\n';   // true false
std::cout << trie.countPrefix("ap") << ' ' << trie.countPrefix("b") << '\n'; // 3 1
```

The root's destructor deletes its children, theirs delete their own, and so the whole trie frees itself when `trie` goes out of scope.

### Children in an unordered_map, for any characters

A map only stores the children that exist, so it saves memory on sparse tries and takes any `char`. Its children come out in no order, so sort before you print.

```cpp
#include <unordered_map>

struct MapNode {
    std::unordered_map<char, MapNode*> children;
    bool isEnd = false;
    ~MapNode() {
        for (auto& [c, child] : children) delete child;
    }
};

void insertWord(MapNode* root, const std::string& word) {
    MapNode* node = root;
    for (char c : word) {
        auto it = node->children.find(c);
        if (it == node->children.end()) it = node->children.emplace(c, new MapNode()).first;
        node = it->second;
    }
    node->isEnd = true;
}

MapNode root;
insertWord(&root, "Hi!");
insertWord(&root, "Hey");
std::cout << root.children.size() << ' ' << root.children['H']->children.size() << '\n';   // 1 2
```

`node->children[c]` would insert a `nullptr` for a missing letter, which is why the walk uses `find`.

### Wildcard search by DFS

Add and search words, where `.` matches any one letter. On a `.`, try every child.

```cpp harness
struct TrieNode { TrieNode* children[26] = {}; bool isEnd = false; ~TrieNode() { for (TrieNode* c : children) delete c; } };
void insert(TrieNode* root, const std::string& w) { TrieNode* n = root; for (char c : w) { int i = c - 'a'; if (!n->children[i]) n->children[i] = new TrieNode(); n = n->children[i]; } n->isEnd = true; }
{{code}}
```

```cpp
bool match(const TrieNode* node, const std::string& word, std::size_t i) {
    if (node == nullptr) return false;
    if (i == word.size()) return node->isEnd;
    if (word[i] == '.') {
        for (const TrieNode* child : node->children) {
            if (match(child, word, i + 1)) return true;     // any letter will do
        }
        return false;
    }
    return match(node->children[word[i] - 'a'], word, i + 1);
}

TrieNode root;
for (const char* w : {"bad", "dad", "mad"}) insert(&root, w);
std::cout << std::boolalpha;
std::cout << match(&root, "pad", 0) << ' ' << match(&root, ".ad", 0) << '\n';   // false true
std::cout << match(&root, "b..", 0) << ' ' << match(&root, "b.", 0) << '\n';    // true false
```

### Every word under a prefix (autocomplete)

Walk to the prefix's node, then DFS below it. With array children, visiting `a` to `z` in order lists the words sorted.

```cpp harness
struct TrieNode { TrieNode* children[26] = {}; bool isEnd = false; ~TrieNode() { for (TrieNode* c : children) delete c; } };
void insert(TrieNode* root, const std::string& w) { TrieNode* n = root; for (char c : w) { int i = c - 'a'; if (!n->children[i]) n->children[i] = new TrieNode(); n = n->children[i]; } n->isEnd = true; }
{{code}}
```

```cpp
#include <vector>

void collect(const TrieNode* node, std::string& path, std::vector<std::string>& out) {
    if (node->isEnd) out.push_back(path);
    for (int i = 0; i < 26; i++) {
        if (node->children[i] == nullptr) continue;
        path.push_back(static_cast<char>('a' + i));   // choose
        collect(node->children[i], path, out);        // explore
        path.pop_back();                              // un-choose
    }
}

TrieNode root;
for (const char* w : {"card", "care", "cat", "car", "dog"}) insert(&root, w);
std::string prefix = "car";
const TrieNode* node = &root;
for (char c : prefix) {
    if (node != nullptr) node = node->children[c - 'a'];
}
std::vector<std::string> words;
if (node != nullptr) collect(node, prefix, words);
for (const auto& w : words) std::cout << w << ' ';   // car card care
```

### Costs

| Operation | Cost |
|---|---|
| insert, search, starts with | O(L), L the word's length |
| count by prefix (with a count per node) | O(L) |
| wildcard search with `d` dots | up to `O(26^d * L)` |
| memory | up to 26 pointers for every node |

### Gotchas

- `TrieNode* children[26];` without `= {}` holds garbage pointers, and the first `if (children[i] == nullptr)` reads junk. Always zero them.
- `c - 'a'` is only 0 to 25 for lowercase letters. Uppercase, digits, or spaces index out of the array, so use a map or check the input.
- `search` must check `isEnd`. Reaching the last letter only proves the word is a prefix of something.
- A trie of pointers needs a destructor or `std::unique_ptr` children, or every node leaks.
