# Stacks and Queues

`std::stack` from `<stack>` is last in, first out, `std::queue` from `<queue>` is first in, first out, and `std::deque` from `<deque>` adds and removes at both ends. The one thing to know first: `pop()` returns nothing. Read `top()` or `front()` into a variable, then pop.

### Stack

```cpp
#include <stack>

std::stack<int> st;
st.push(1);
st.push(2);
st.push(3);
std::cout << st.top() << '\n';    // 3, the last one pushed
int x = st.top();                 // copy it first
st.pop();                         // then remove it, pop returns void
std::cout << x << ' ' << st.size() << '\n';   // 3 2
while (!st.empty()) {
    std::cout << st.top() << ' '; // 2 1
    st.pop();
}
```

### Queue

```cpp
#include <queue>
#include <string>

std::queue<std::string> q;
q.push("ana");                    // joins at the back
q.push("bo");
q.push("cy");
std::cout << q.front() << ' ' << q.back() << '\n';   // ana cy
std::string next = q.front();
q.pop();                          // removes ana
std::cout << next << ' ' << q.size() << '\n';        // ana 2
```

### Deque: both ends

```cpp
#include <deque>

std::deque<int> dq = {2, 3};
dq.push_front(1);
dq.push_back(4);
for (int x : dq) std::cout << x << ' ';            // 1 2 3 4
std::cout << '\n';
std::cout << dq.front() << ' ' << dq.back() << ' ' << dq[1] << '\n';   // 1 4 2
dq.pop_front();
dq.pop_back();
for (int x : dq) std::cout << x << ' ';            // 2 3
```

### Simulate with a stack: a vector

When you need to loop over the stack or sum it at the end, a `std::vector` works as one: `push_back`, `back`, `pop_back`. Baseball game keeps its scores this way.

```cpp
#include <vector>

std::vector<std::string> ops = {"5", "2", "C", "D", "+"};
std::vector<int> scores;
for (const auto& op : ops) {
    if (op == "+") scores.push_back(scores[scores.size() - 1] + scores[scores.size() - 2]);
    else if (op == "D") scores.push_back(2 * scores.back());
    else if (op == "C") scores.pop_back();
    else scores.push_back(std::stoi(op));
}
int total = 0;
for (int s : scores) total += s;
std::cout << total << '\n';   // 30, from 5 10 15
```

### Calls

| Call | `stack` | `queue` | `deque` | Cost |
|---|---|---|---|---|
| add | `push(x)` | `push(x)` at the back | `push_front(x)`, `push_back(x)` | O(1) |
| look | `top()` | `front()`, `back()` | `front()`, `back()`, `dq[i]` | O(1) |
| remove | `pop()` | `pop()` from the front | `pop_front()`, `pop_back()` | O(1) |
| `size()`, `empty()` | yes | yes | yes | O(1) |

### Valid parentheses

```cpp
bool isValid(const std::string& s) {
    std::stack<char> open;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            open.push(c);
        } else {
            if (open.empty()) return false;          // a closer with nothing to close
            char top = open.top();
            open.pop();
            if ((c == ')' && top != '(') || (c == ']' && top != '[') || (c == '}' && top != '{')) return false;
        }
    }
    return open.empty();                             // leftovers never closed
}

std::cout << std::boolalpha << isValid("{[()]}") << ' ' << isValid("(]") << ' ' << isValid("((") << '\n';   // true false false
```

### Min stack: getMin in O(1)

A second stack holds the minimum so far at each depth.

```cpp
class MinStack {
public:
    void push(int x) {
        values.push(x);
        mins.push(mins.empty() ? x : std::min(x, mins.top()));
    }
    void pop() {
        values.pop();
        mins.pop();
    }
    int top() const { return values.top(); }
    int getMin() const { return mins.top(); }

private:
    std::stack<int> values;
    std::stack<int> mins;
};

MinStack ms;
ms.push(5);
ms.push(2);
ms.push(7);
std::cout << ms.getMin() << ' ' << ms.top() << '\n';   // 2 7
ms.pop();
ms.pop();
std::cout << ms.getMin() << '\n';                      // 5
```

### Monotonic stack: days until warmer

The stack holds indexes of days still waiting for a warmer one, and their temperatures only go down from bottom to top. Each index is pushed and popped once, so it's O(n).

```cpp
std::vector<int> temps = {73, 74, 75, 71, 69, 72, 76, 73};
std::vector<int> wait(temps.size(), 0);
std::stack<int> idx;
for (int i = 0; i < static_cast<int>(temps.size()); i++) {
    while (!idx.empty() && temps[i] > temps[idx.top()]) {
        wait[idx.top()] = i - idx.top();   // day i is the warmer day it waited for
        idx.pop();
    }
    idx.push(i);
}
for (int w : wait) std::cout << w << ' ';   // 1 1 4 2 1 1 0 0
```

The same loop with `<` finds the next smaller value, and running it from the right finds the previous greater one.

### Monotonic deque: sliding window maximum

The deque holds indexes whose values go down from front to back. The front is the window's maximum, old indexes leave from the front, and smaller values leave from the back.

```cpp
std::vector<int> v = {1, 3, -1, -3, 5, 3, 6, 7};
int k = 3;
std::deque<int> win;
for (int i = 0; i < static_cast<int>(v.size()); i++) {
    if (!win.empty() && win.front() <= i - k) win.pop_front();      // fell out of the window
    while (!win.empty() && v[win.back()] <= v[i]) win.pop_back();   // can never be the max now
    win.push_back(i);
    if (i >= k - 1) std::cout << v[win.front()] << ' ';            // 3 3 5 5 6 7
}
```

### Circular queue: a fixed array, a head, and a size

```cpp
class CircularQueue {
public:
    explicit CircularQueue(int k) : data(k) {}
    bool enqueue(int x) {
        if (isFull()) return false;
        data[(head + count) % data.size()] = x;   // wraps past the end
        count++;
        return true;
    }
    bool dequeue() {
        if (count == 0) return false;
        head = (head + 1) % data.size();
        count--;
        return true;
    }
    int front() const { return count == 0 ? -1 : data[head]; }
    int rear() const { return count == 0 ? -1 : data[(head + count - 1) % data.size()]; }
    bool isFull() const { return count == data.size(); }

private:
    std::vector<int> data;
    std::size_t head = 0, count = 0;
};

CircularQueue cq(2);
cq.enqueue(1);
cq.enqueue(2);
std::cout << std::boolalpha << cq.enqueue(3) << '\n';   // false, full
cq.dequeue();
cq.enqueue(3);
std::cout << cq.front() << ' ' << cq.rear() << '\n';    // 2 3
```

### Gotchas

- `pop()` returns `void`, so `int x = st.pop();` doesn't compile. Read `top()` or `front()` first.
- `top()`, `front()`, and `pop()` on an empty container are undefined behavior, not an exception. Check `empty()` first.
- `const auto& x = q.front(); q.pop();` leaves `x` pointing at a destroyed element. Copy it with plain `auto`.
- A `std::stack` or `std::queue` has no iterators, so no range-for and no printing. Pop it in a loop, or use a vector or deque.
