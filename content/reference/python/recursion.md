# Recursion and Backtracking

A recursive function calls itself on a smaller input and stops at a base case. Backtracking builds an answer one choice at a time: make a choice, recurse, then undo it and try the next. Python stops at about 1000 nested calls by default, so deep recursion needs `sys.setrecursionlimit` or a loop.

### Base case and recursive case

```python
def factorial(n):
    if n <= 1:                    # base case: no more calls
        return 1
    return n * factorial(n - 1)   # recursive case: a smaller n

def digit_sum(n):
    return n if n < 10 else n % 10 + digit_sum(n // 10)

def power(base, exp):             # halves exp, so O(log exp) calls
    if exp == 0:
        return 1
    half = power(base, exp // 2)
    return half * half * (base if exp % 2 else 1)

print(factorial(5), digit_sum(4096), power(2, 10))   # 120 19 1024
```

### A helper that carries an index

Passing an index is O(1) per call. Slicing (`s[1:]`) copies the rest every time.

```python
def is_pal(s, lo, hi):
    if lo >= hi:
        return True
    return s[lo] == s[hi] and is_pal(s, lo + 1, hi - 1)

def total(nums, i=0):
    return 0 if i == len(nums) else nums[i] + total(nums, i + 1)

print(is_pal("racecar", 0, 6), total([3, 4, 5]))   # True 12
```

### Subsets: take it or leave it

Each item is either in or out, so there are `2 ** n` subsets.

```python
def subsets(nums):
    out, path = [], []
    def backtrack(i):
        if i == len(nums):
            out.append(path[:])        # a copy: path keeps changing
            return
        path.append(nums[i])           # take nums[i]
        backtrack(i + 1)
        path.pop()                     # undo
        backtrack(i + 1)               # leave it
    backtrack(0)
    return out

subs = subsets([1, 2, 3])
print(len(subs), subs[:3])             # 8 [[1, 2, 3], [1, 2], [1, 3]]
by_size = sorted(subs, key=lambda s: (len(s), s))   # by length, then by values
print(by_size)   # [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]
```

### Combinations: a start index

Start the loop after the last item you picked, so each group comes out once.

```python
def combine(n, k):
    out, path = [], []
    def backtrack(start):
        if len(path) == k:
            out.append(path[:])
            return
        for x in range(start, n + 1):
            path.append(x)
            backtrack(x + 1)
            path.pop()
    backtrack(1)
    return out

print(combine(4, 2))   # [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]
```

### Permutations: a used list

```python
def permutations(nums):
    out, path = [], []
    used = [False] * len(nums)
    def backtrack():
        if len(path) == len(nums):
            out.append(path[:])
            return
        for i, x in enumerate(nums):
            if used[i]:
                continue
            used[i] = True
            path.append(x)
            backtrack()
            path.pop()
            used[i] = False
    backtrack()
    return out

perms = permutations([1, 2, 3])   # sorted input gives lexicographic order
print(len(perms), perms[:3])      # 6 [[1, 2, 3], [1, 3, 2], [2, 1, 3]]
```

With duplicates in the input, sort it and skip `nums[i]` when it equals `nums[i - 1]` and `used[i - 1]` is `False`.

### Combination sum: reuse and a running total

```python
def combination_sum(candidates, target):
    candidates = sorted(candidates)
    out, path = [], []
    def backtrack(start, remaining):
        if remaining == 0:
            out.append(path[:])
            return
        for i in range(start, len(candidates)):
            c = candidates[i]
            if c > remaining:
                break                    # sorted, so the rest are too big
            path.append(c)
            backtrack(i, remaining - c)  # i, not i + 1: c can be used again
            path.pop()
    backtrack(0, target)
    return out

print(combination_sum([2, 3, 6, 7], 7))   # [[2, 2, 3], [7]]
```

### N-Queens: sets for columns and diagonals

On one diagonal `r - c` is the same, and on the other `r + c` is.

```python
def n_queens(n):
    cols, diag, anti = set(), set(), set()
    def place(r):
        if r == n:
            return 1
        count = 0
        for c in range(n):
            if c in cols or r - c in diag or r + c in anti:
                continue
            cols.add(c)
            diag.add(r - c)
            anti.add(r + c)
            count += place(r + 1)
            cols.remove(c)
            diag.remove(r - c)
            anti.remove(r + c)
        return count
    return place(0)

print(n_queens(4), n_queens(8))   # 2 92
```

### The built-in check: itertools

```python
from itertools import combinations, permutations, product

print(list(permutations([1, 2, 3]))[:3])   # [(1, 2, 3), (1, 3, 2), (2, 1, 3)]
print(list(permutations("abc", 2))[:3])    # [('a', 'b'), ('a', 'c'), ('b', 'a')]
print(list(combinations([1, 2, 3], 2)))    # [(1, 2), (1, 3), (2, 3)]
print([list(c) for r in range(3) for c in combinations([1, 2], r)])   # [[], [1], [2], [1, 2]]
print(list(product("01", repeat=2)))       # [('0', '0'), ('0', '1'), ('1', '0'), ('1', '1')]
```

They return tuples, in lexicographic order when the input is sorted.

### The recursion limit

```python error
def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)

print(depth(5000))   # RecursionError: maximum recursion depth exceeded
```

```python
import sys

print(sys.getrecursionlimit())     # 1000
sys.setrecursionlimit(10_000)

def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)

print(depth(5000))                 # 5000
```

### Mutable default arguments

A default value is made once, when `def` runs, and shared by every call.

```python
def collect(x, items=[]):
    items.append(x)
    return items

print(collect(1), collect(2))       # [1, 2] [1, 2]  one shared list

def collect_fixed(x, items=None):
    if items is None:
        items = []
    items.append(x)
    return items

print(collect_fixed(1), collect_fixed(2))   # [1] [2]
```

### Gotchas

- Append `path[:]` or `list(path)`, not `path`. Every saved answer would be the same list, empty by the end.
- Undo every change after the recursive call (`pop`, `remove`, `used[i] = False`), or the next branch starts from a wrong state.
- `sys.setrecursionlimit` raises the limit for plain recursion, but not through `@cache`, which stops near 500 levels on Python 3.12.0. Very deep recursion also uses a lot of memory, so for huge inputs use a loop with a stack.
- A recursive function that branches twice without a cache, like `fib(n - 1) + fib(n - 2)`, takes exponential time. See Dynamic Programming.
