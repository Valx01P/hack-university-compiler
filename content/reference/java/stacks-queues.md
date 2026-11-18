# Stacks and Queues

Use `ArrayDeque` for both: declare a stack as `Deque<T>` and a queue as `Queue<T>`. It's faster than the old `Stack` class and than `LinkedList`, and every call below is O(1).

### Stack

```java
import java.util.ArrayDeque;
import java.util.Deque;

Deque<Integer> stack = new ArrayDeque<>();
stack.push(1);
stack.push(2);
stack.push(3);
System.out.println(stack);           // [3, 2, 1], top first
System.out.println(stack.peek());    // 3, look at the top
System.out.println(stack.pop());     // 3, remove the top
System.out.println(stack.size());    // 2
System.out.println(stack.isEmpty()); // false
```

### Queue

```java
import java.util.Queue;

Queue<String> queue = new ArrayDeque<>();
queue.offer("a");                    // add at the back
queue.offer("b");
System.out.println(queue.peek());    // a, look at the front
System.out.println(queue.poll());    // a, remove the front
System.out.println(queue.size());    // 1
System.out.println(queue.poll());    // b
System.out.println(queue.poll());    // null, empty
```

### Deque: both ends

```java
Deque<Integer> d = new ArrayDeque<>();
d.offerLast(2);
d.offerLast(3);
d.offerFirst(1);
System.out.println(d);              // [1, 2, 3]
System.out.println(d.peekFirst());  // 1
System.out.println(d.peekLast());   // 3
System.out.println(d.pollLast());   // 3
System.out.println(d.pollFirst());  // 1
System.out.println(d);              // [2]
```

### Calls

| Use | Add | Remove | Look | When empty |
| --- | --- | --- | --- | --- |
| stack | `push(x)` | `pop()` | `peek()` | `pop()` throws, `peek()` gives `null` |
| queue | `offer(x)` | `poll()` | `peek()` | `null` |
| front | `offerFirst(x)` | `pollFirst()` | `peekFirst()` | `null` |
| back | `offerLast(x)` | `pollLast()` | `peekLast()` | `null` |

`addFirst`, `addLast`, `removeFirst`, `removeLast`, `getFirst`, and `getLast` do the same but throw `NoSuchElementException` when empty. `push` is `addFirst` and `pop` is `removeFirst`, which is why a stack prints top first.

### Loop and drain

```java
Deque<Integer> stack = new ArrayDeque<>();
for (int x : new int[]{1, 2, 3}) {
    stack.push(x);
}
for (int x : stack) {
    System.out.print(x + " ");           // 3 2 1, top to bottom, stack unchanged
}
System.out.println();
while (!stack.isEmpty()) {
    System.out.print(stack.pop() + " "); // 3 2 1, and the stack ends empty
}
```

### Valid parentheses

Push the closer you expect, and pop it when a closer arrives.

```java
static boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        if (c == '(') {
            stack.push(')');
        } else if (c == '[') {
            stack.push(']');
        } else if (c == '{') {
            stack.push('}');
        } else if (stack.isEmpty() || stack.pop() != c) {
            return false;
        }
    }
    return stack.isEmpty();
}

System.out.println(isValid("({[]})")); // true
System.out.println(isValid("([)]"));   // false
System.out.println(isValid("(("));     // false
```

### Min stack

A second stack holds the minimum at each depth, so `getMin` is O(1).

```java
class MinStack {
    private final Deque<Integer> values = new ArrayDeque<>();
    private final Deque<Integer> mins = new ArrayDeque<>();

    void push(int x) {
        values.push(x);
        mins.push(mins.isEmpty() ? x : Math.min(x, mins.peek()));
    }

    void pop() {
        values.pop();
        mins.pop();
    }

    int top() { return values.peek(); }

    int getMin() { return mins.peek(); }
}

MinStack ms = new MinStack();
ms.push(5);
ms.push(2);
ms.push(7);
System.out.println(ms.getMin());                  // 2
ms.pop();
ms.pop();
System.out.println(ms.top() + " " + ms.getMin()); // 5 5
```

### Monotonic stack: days until warmer

Keep indexes whose values fall from bottom to top. A new value pops every smaller one, and it is their answer.

```java
import java.util.Arrays;

int[] temps = {73, 74, 75, 71, 69, 72, 76, 73};
int[] wait = new int[temps.length];
Deque<Integer> stack = new ArrayDeque<>();         // indexes, temps falling
for (int i = 0; i < temps.length; i++) {
    while (!stack.isEmpty() && temps[stack.peek()] < temps[i]) {
        int j = stack.pop();
        wait[j] = i - j;                           // day i is warmer than day j
    }
    stack.push(i);
}
System.out.println(Arrays.toString(wait)); // [1, 1, 4, 2, 1, 1, 0, 0]
```

### Monotonic deque: sliding window maximum

The front holds the index of the window's max. Drop it from the front when it leaves the window, and drop smaller values from the back before adding.

```java
int[] nums = {1, 3, -1, -3, 5, 3, 6, 7};
int k = 3;
int[] maxes = new int[nums.length - k + 1];
Deque<Integer> dq = new ArrayDeque<>();            // indexes, values falling front to back
for (int i = 0; i < nums.length; i++) {
    if (!dq.isEmpty() && dq.peekFirst() <= i - k) {
        dq.pollFirst();                            // out of the window
    }
    while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) {
        dq.pollLast();                             // can never be the max again
    }
    dq.offerLast(i);
    if (i >= k - 1) {
        maxes[i - k + 1] = nums[dq.peekFirst()];
    }
}
System.out.println(Arrays.toString(maxes)); // [3, 3, 5, 5, 6, 7]
```

### Simulate with a stack

Baseball game: `+` adds the last two scores, `D` doubles the last, `C` drops it. To read the one below the top, pop the top, peek, and push it back.

```java
String[] ops = {"5", "2", "C", "D", "+"};
Deque<Integer> scores = new ArrayDeque<>();
for (String op : ops) {
    if (op.equals("+")) {                      // equals, never == on strings
        int last = scores.pop();
        int sum = last + scores.peek();
        scores.push(last);
        scores.push(sum);
    } else if (op.equals("D")) {
        scores.push(2 * scores.peek());
    } else if (op.equals("C")) {
        scores.pop();
    } else {
        scores.push(Integer.parseInt(op));
    }
}
int total = 0;
for (int s : scores) total += s;
System.out.println(scores + " " + total);      // [15, 10, 5] 30
```

### Circular queue: a fixed array, a head, and a size

```java
class CircularQueue {
    private final int[] data;
    private int head = 0;
    private int size = 0;

    CircularQueue(int k) {
        data = new int[k];
    }

    boolean enqueue(int x) {
        if (isFull()) {
            return false;
        }
        data[(head + size) % data.length] = x;   // wraps past the end
        size++;
        return true;
    }

    boolean dequeue() {
        if (size == 0) {
            return false;
        }
        head = (head + 1) % data.length;
        size--;
        return true;
    }

    int front() { return size == 0 ? -1 : data[head]; }

    int rear() { return size == 0 ? -1 : data[(head + size - 1) % data.length]; }

    boolean isFull() { return size == data.length; }
}

CircularQueue cq = new CircularQueue(3);
System.out.println(cq.enqueue(1) + " " + cq.enqueue(2) + " " + cq.enqueue(3) + " " + cq.enqueue(4)); // true true true false
cq.dequeue();
cq.enqueue(4);                                                         // wraps to slot 0
System.out.println(cq.front() + " " + cq.rear() + " " + cq.isFull()); // 2 4 true
```

### Gotchas

- `pop()` on an empty stack throws `NoSuchElementException`. Check `isEmpty()` first, or use `poll()`, which returns `null`.
- `ArrayDeque` rejects `null`, so `push(null)` throws. Use a sentinel value instead.
- `==` on two `Integer` values compares objects. Java reuses them only from -128 to 127, so it works in small tests and fails on real data.
- The old `Stack` class prints bottom first and is slower. `LinkedList` works as a queue but is slower than `ArrayDeque` too.
