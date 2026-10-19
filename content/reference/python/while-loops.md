# While Loops

`while` repeats as long as its condition is truthy. Python has no `do while` and no `++`, so you write `while True` with a `break`, and `i += 1`.

### Basic counter

```python
i = 0
while i < 3:
    print(i)        # 0, 1, 2
    i += 1
```

### Loop until something changes

```python
n = 100
steps = 0
while n > 1:
    n //= 2         # halve it
    steps += 1
print(steps)        # 6

n = 4096
digits = 0
while n > 0:        # peel off digits
    n //= 10
    digits += 1
print(digits)       # 4
```

### while True with break (do-while)

```python
total = 0
while True:
    total += 7      # the body always runs at least once
    if total > 30:
        break
print(total)        # 35
```

### Drain a list, stack, or queue

```python
from collections import deque

stack = [1, 2, 3]
while stack:                    # an empty list is falsy
    print(stack.pop())          # 3, 2, 1

queue = deque([1, 2, 3])
while queue:
    print(queue.popleft())      # 1, 2, 3
```

### Read input until a sentinel

The walrus operator `:=` assigns inside the condition:

```stdin
hi
there
quit
```

```python
while (line := input()) != "quit":
    print("got", line)
```

Reading until the end of input (`EOFError`, `sys.stdin`) is in User Input.

### continue and else

```python
i = 0
while i < 6:
    i += 1          # update first, so continue can't skip it
    if i % 2 == 1:
        continue
    print(i)        # 2, 4, 6

n = 7
d = 2
while d * d <= n:
    if n % d == 0:
        print("not prime")
        break
    d += 1
else:
    print("prime")  # runs only when the loop did not break
```

### Two indexes moving toward each other

```python
nums = [1, 3, 4, 6, 9]
lo, hi = 0, len(nums) - 1
while lo < hi:
    s = nums[lo] + nums[hi]
    if s == 10:
        print(nums[lo], nums[hi])   # 1 9
        break
    if s < 10:
        lo += 1
    else:
        hi -= 1
```

| Pattern | Write |
| --- | --- |
| count up | `i = 0` then `while i < n:` with `i += 1` |
| at least once | `while True:` with `if done: break` at the end |
| until empty | `while stack:` |
| assign and test | `while (x := f()) != stop:` |
| forever | `while True:` |

### Gotchas

- Forgetting to update the variable loops forever. If you use `continue`, update before it.
- `i++` and `i--` are syntax errors. Use `i += 1` and `i -= 1`.
- `while x = 5:` is a syntax error. Compare with `==`, or assign with `:=`.
- If you know how many times to loop, `for i in range(n)` is shorter and can't loop forever.
