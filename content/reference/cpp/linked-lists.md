# Linked Lists

A linked list is a chain of nodes on the heap, each holding a value and a pointer to the next one. The list is just a pointer to its first node, the head, and `nullptr` ends it. `std::list` is a ready-made doubly linked list, but interview problems give you the `ListNode` struct below and expect you to rewire pointers yourself.

### The node struct (LeetCode shape), build, print, free

A local `dummy` node sits before the head, so the first append needs no special case.

```cpp
#include <vector>

struct ListNode {
    int val;
    ListNode* next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode* next) : val(x), next(next) {}
};

ListNode* build(const std::vector<int>& values) {
    ListNode dummy;
    ListNode* tail = &dummy;
    for (int v : values) {
        tail->next = new ListNode(v);
        tail = tail->next;
    }
    return dummy.next;            // the real head, nullptr for an empty vector
}

void print(const ListNode* head) {
    for (const ListNode* cur = head; cur != nullptr; cur = cur->next) {
        std::cout << cur->val << (cur->next ? " -> " : "");
    }
    std::cout << '\n';               // an empty list prints an empty line
}

void freeList(ListNode* head) {
    while (head != nullptr) {
        ListNode* next = head->next;   // save it before the delete
        delete head;
        head = next;
    }
}

ListNode* head = build({3, 1, 4});   // or new ListNode(3, new ListNode(1, new ListNode(4)))
print(head);                       // 3 -> 1 -> 4
int length = 0;
for (ListNode* cur = head; cur != nullptr; cur = cur->next) length++;
std::cout << length << '\n';       // 3
freeList(head);                    // LeetCode skips this, but every new needs a delete
```

### Reverse

```cpp harness
struct ListNode { int val; ListNode* next; ListNode(int x = 0, ListNode* n = nullptr) : val(x), next(n) {} }; ListNode* build(const std::vector<int>& v) { ListNode d; ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; } void print(const ListNode* h) { for (; h; h = h->next) std::cout << h->val << (h->next ? " -> " : ""); std::cout << '\n'; }
{{code}}
```

```cpp
ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    ListNode* cur = head;
    while (cur != nullptr) {
        ListNode* next = cur->next;   // save the rest
        cur->next = prev;             // point back
        prev = cur;
        cur = next;
    }
    return prev;                      // the old tail is the new head
}

ListNode* head = build({1, 2, 3, 4});
head = reverseList(head);             // keep the returned head
print(head);                          // 4 -> 3 -> 2 -> 1
```

### Dummy head and two pointers n apart: remove the nth from the end

A `dummy` node before the head gives every real node a node before it, so removing the head is no special case. Relink first, then `delete`.

```cpp harness
struct ListNode { int val; ListNode* next; ListNode(int x = 0, ListNode* n = nullptr) : val(x), next(n) {} }; ListNode* build(const std::vector<int>& v) { ListNode d; ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; } void print(const ListNode* h) { for (; h; h = h->next) std::cout << h->val << (h->next ? " -> " : ""); std::cout << '\n'; }
{{code}}
```

```cpp
ListNode* removeNthFromEnd(ListNode* head, int n) {
    ListNode dummy(0, head);
    ListNode* fast = &dummy;
    ListNode* slow = &dummy;
    for (int i = 0; i < n; i++) fast = fast->next;   // fast starts n ahead
    while (fast->next != nullptr) {
        fast = fast->next;
        slow = slow->next;
    }
    ListNode* doomed = slow->next;    // slow stops just before the one to remove
    slow->next = doomed->next;        // relink around it
    delete doomed;
    return dummy.next;
}

print(removeNthFromEnd(build({1, 2, 3, 4, 5}), 2));   // 1 -> 2 -> 3 -> 5
print(removeNthFromEnd(build({1}), 1));               // an empty line, the list is gone
```

### Merge two sorted lists

```cpp harness
struct ListNode { int val; ListNode* next; ListNode(int x = 0, ListNode* n = nullptr) : val(x), next(n) {} }; ListNode* build(const std::vector<int>& v) { ListNode d; ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; } void print(const ListNode* h) { for (; h; h = h->next) std::cout << h->val << (h->next ? " -> " : ""); std::cout << '\n'; }
{{code}}
```

```cpp
ListNode* mergeTwo(ListNode* a, ListNode* b) {
    ListNode dummy;
    ListNode* tail = &dummy;
    while (a != nullptr && b != nullptr) {
        if (a->val <= b->val) {
            tail->next = a;           // splice the node in, no copy
            a = a->next;
        } else {
            tail->next = b;
            b = b->next;
        }
        tail = tail->next;
    }
    tail->next = (a != nullptr) ? a : b;   // the rest of whichever is left
    return dummy.next;
}

print(mergeTwo(build({1, 2, 4}), build({1, 3, 4})));   // 1 -> 1 -> 2 -> 3 -> 4 -> 4
```

### Merge k sorted lists: a heap of nodes

```cpp harness
struct ListNode { int val; ListNode* next; ListNode(int x = 0, ListNode* n = nullptr) : val(x), next(n) {} }; ListNode* build(const std::vector<int>& v) { ListNode d; ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; } void print(const ListNode* h) { for (; h; h = h->next) std::cout << h->val << (h->next ? " -> " : ""); std::cout << '\n'; }
{{code}}
```

```cpp
#include <queue>

struct ByVal {
    bool operator()(const ListNode* a, const ListNode* b) const {
        return a->val > b->val;       // smallest value on top
    }
};

ListNode* mergeK(std::vector<ListNode*>& lists) {
    std::priority_queue<ListNode*, std::vector<ListNode*>, ByVal> pq;
    for (ListNode* head : lists) {
        if (head != nullptr) pq.push(head);   // never push nullptr
    }
    ListNode dummy;
    ListNode* tail = &dummy;
    while (!pq.empty()) {
        ListNode* node = pq.top();
        pq.pop();
        tail->next = node;
        tail = node;
        if (node->next != nullptr) pq.push(node->next);
    }
    return dummy.next;
}

std::vector<ListNode*> lists = {build({1, 4, 5}), build({1, 3, 4}), build({2, 6}), nullptr};
print(mergeK(lists));                 // 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
```

### Fast and slow: the middle and a cycle

```cpp harness
struct ListNode { int val; ListNode* next; ListNode(int x = 0, ListNode* n = nullptr) : val(x), next(n) {} }; ListNode* build(const std::vector<int>& v) { ListNode d; ListNode* t = &d; for (int x : v) t = t->next = new ListNode(x); return d.next; } void print(const ListNode* h) { for (; h; h = h->next) std::cout << h->val << (h->next ? " -> " : ""); std::cout << '\n'; }
{{code}}
```

```cpp
ListNode* middle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast != nullptr && fast->next != nullptr) {
        slow = slow->next;            // one step
        fast = fast->next->next;      // two steps
    }
    return slow;                      // the second middle for an even length
}

bool hasCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast != nullptr && fast->next != nullptr) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;   // fast lapped slow
    }
    return false;
}

ListNode* head = build({1, 2, 3, 4, 5});
std::cout << middle(head)->val << '\n';                  // 3
std::cout << std::boolalpha << hasCycle(head) << '\n';  // false
head->next->next->next->next->next = head->next;         // 5 now points back at 2
std::cout << hasCycle(head) << '\n';                     // true
```

### LRU cache: std::list and a map of iterators

`std::list` is doubly linked, and `splice` moves a node to the front in O(1) without copying. The map finds each key's node.

```cpp
#include <list>
#include <unordered_map>
#include <utility>

class LRUCache {
public:
    explicit LRUCache(int capacity) : cap(capacity) {}
    int get(int key) {
        auto it = where.find(key);
        if (it == where.end()) return -1;
        items.splice(items.begin(), items, it->second);   // now the most recent
        return it->second->second;
    }
    void put(int key, int value) {
        auto it = where.find(key);
        if (it != where.end()) {
            items.erase(it->second);               // drop the old entry
        } else if (static_cast<int>(items.size()) == cap) {
            where.erase(items.back().first);       // full: evict the least recent
            items.pop_back();
        }
        items.push_front({key, value});
        where[key] = items.begin();
    }

private:
    int cap;
    std::list<std::pair<int, int>> items;   // front is the most recent
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> where;
};

LRUCache cache(2);
cache.put(1, 1);
cache.put(2, 2);
std::cout << cache.get(1) << '\n';   // 1
cache.put(3, 3);                     // evicts 2
std::cout << cache.get(2) << ' ' << cache.get(3) << '\n';   // -1 3
```

### Gotchas

- Check `node != nullptr` before every `node->next`. Reading through `nullptr` crashes, and `fast->next->next` needs both checks.
- A function that can change the head must return it, and the caller must store it: `head = reverseList(head);`.
- Save `next` before you `delete` a node or point it somewhere else. Once it's gone, the rest of the list is lost.
- Never print a pointer to show a node. The address changes every run. Print `node->val`.
