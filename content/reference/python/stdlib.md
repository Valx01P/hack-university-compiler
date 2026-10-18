# Standard Library

Python ships "batteries included": everything here is one `import` away, nothing to install. These are the modules you reach for most.

| Module | Reach for it when you need |
| --- | --- |
| `collections` | `deque`, `Counter`, `defaultdict`, `namedtuple` |
| `heapq` | a priority queue (min-heap) on a plain list |
| `bisect` | binary search and sorted inserts |
| `itertools` | combinations, permutations, products, chaining |
| `functools` | `cache`, `reduce`, `partial`, `cmp_to_key` |
| `math` | `sqrt`, `gcd`, `inf`, `comb`, `isqrt` (see Math Operators) |
| `random` | random numbers, choices, shuffles |
| `string`, `re` | letter constants and regular expressions |
| `json`, `datetime`, `time` | data exchange, dates, timing |

### collections

```python
from collections import deque, Counter

q = deque([1, 2])
q.append(3)                   # right end
q.appendleft(0)               # left end, O(1) unlike list.insert(0, x)
print(q.popleft(), q.pop())   # 0 3
last3 = deque(maxlen=3)       # keeps only the newest 3

c = Counter("mississippi")
print(c["s"], c["z"])         # 4 0
print(c.most_common(2))       # [('i', 4), ('s', 4)]
```

`defaultdict` and `Counter` for counting are in Dictionaries, and `namedtuple` is in Tuples.

### heapq (priority queue)

```python
import heapq

heap = []
for task in [(3, "low"), (1, "urgent"), (2, "normal")]:
    heapq.heappush(heap, task)        # tuples sort by first item
while heap:
    priority, name = heapq.heappop(heap)
    print(priority, name)             # 1 urgent, 2 normal, 3 low

nums = [5, 1, 8, 3]
heapq.heapify(nums)                   # in place, O(n)
print(heapq.nsmallest(2, nums))       # [1, 3]
print(heapq.nlargest(2, nums))        # [8, 5]
```

It is a min-heap only. For a max-heap, push `-value` and negate when you pop.

### bisect (sorted lists)

```python
import bisect

a = [1, 3, 3, 7]
print(bisect.bisect_left(a, 3))       # 1  first index where 3 could go
print(bisect.bisect_right(a, 3))      # 3  after the last 3
bisect.insort(a, 5)
print(a)                              # [1, 3, 3, 5, 7]
```

### itertools

```python
from itertools import combinations, permutations, product, accumulate, chain

print(list(combinations("abc", 2)))   # [('a', 'b'), ('a', 'c'), ('b', 'c')]
print(len(list(permutations("abc")))) # 6
print(list(product([0, 1], repeat=2)))  # [(0, 0), (0, 1), (1, 0), (1, 1)]
print(list(accumulate([1, 2, 3, 4]))) # [1, 3, 6, 10]
print(list(chain([1, 2], [3])))       # [1, 2, 3]
```

### functools

```python
from functools import cmp_to_key, partial, reduce

print(reduce(lambda a, b: a * b, [1, 2, 3, 4]))   # 24

from_binary = partial(int, base=2)    # fix some arguments now
print(from_binary("1010"))            # 10

def by_len_then_alpha(a, b):          # negative, zero, or positive
    return len(a) - len(b) or (a > b) - (a < b)

print(sorted(["bb", "a", "ab"], key=cmp_to_key(by_len_then_alpha)))  # ['a', 'ab', 'bb']
```

`@cache` for memoizing a recursive function is in Functions.

### random

```python
import random

random.seed(42)                       # same "random" values every run
print(random.randint(1, 6))           # 6  inclusive on both ends
pick = random.choice(["a", "b", "c"])
deck = list(range(5))
random.shuffle(deck)                  # in place
three = random.sample(range(100), 3)  # 3 distinct values
```

### string, re, json

```python
import json
import re
import string

print(string.ascii_lowercase)         # abcdefghijklmnopqrstuvwxyz
print(string.digits)                  # 0123456789

print(re.findall(r"\d+", "a1b22c333"))   # ['1', '22', '333']
m = re.search(r"(\w+)@(\w+)", "mail ana@site now")
print(m.group(1), m.group(2))         # ana site
print(re.sub(r"\s+", " ", "a   b  c"))   # a b c

text = json.dumps({"id": 1, "tags": ["x"]})
print(text)                           # {"id": 1, "tags": ["x"]}
print(json.loads(text)["tags"])       # ['x']
```

### datetime and time

```python
import time
from datetime import date, datetime, timedelta

d = date(2024, 3, 1)
print(d + timedelta(days=30))         # 2024-03-31
print((date(2024, 12, 25) - d).days)  # 299
print(d.strftime("%b %d, %Y"))        # Mar 01, 2024
dt = datetime.strptime("2024-03-01 14:30", "%Y-%m-%d %H:%M")
print(dt.hour, dt.minute)             # 14 30

start = time.perf_counter()
total = sum(range(1_000_000))
elapsed = time.perf_counter() - start  # seconds, as a float
```

### Gotchas

- `heapq` works on a plain list and is min-first. There is no max-heap, so negate the values.
- `itertools` functions return lazy iterators. Wrap them in `list()` to print or reuse, and they can be consumed only once.
- `random.randint(1, 6)` includes 6, unlike `range(1, 6)`.
- Naming your own file `random.py` or `json.py` hides the real module, and the import breaks.
