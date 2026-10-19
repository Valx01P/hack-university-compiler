# Tuples

A `tuple` is an immutable, ordered sequence. It is Python's pair, triple, and "return several values" type. Tuples of hashable values are hashable, so they work as dict keys and set items.

### Create

```python
point = (3, 4)
pair = "ana", 31              # parentheses are optional
one = (5,)                    # the comma makes the tuple
not_a_tuple = (5)             # just the int 5
empty = ()
print(tuple([1, 2, 3]))       # (1, 2, 3)
print(type(one).__name__, type(not_a_tuple).__name__)  # tuple int
```

### Access and unpack

```python
point = (3, 4, 5)
print(point[0], point[-1])    # 3 5
print(point[1:])              # (4, 5)
x, y, z = point               # counts must match
print(x + y + z)              # 12
```

`return a, b` returns a tuple, see Functions. Swaps and `first, *rest` unpacking are in Multiple Assignment.

### Loop

```python
pairs = [("ana", 90), ("bo", 72)]
for name, score in pairs:
    print(name, score)        # ana 90, bo 72
```

### As keys and sort keys

```python
grid = {(0, 0): "start", (2, 3): "goal"}
print(grid[(2, 3)])           # goal

people = [("bo", 25), ("ana", 31), ("cy", 25)]
people.sort(key=lambda p: (p[1], p[0]))   # by age, then name
print(people)                 # [('bo', 25), ('cy', 25), ('ana', 31)]
print((1, 2) < (1, 3))        # True, compared item by item
```

### Named tuples

```python
from collections import namedtuple

Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
print(p.x, p[1])              # 3 4
print(p)                      # Point(x=3, y=4)
p2 = p._replace(x=10)         # new tuple, p unchanged
print(p2._asdict())           # {'x': 10, 'y': 4}
```

The typed form is `typing.NamedTuple`:

```python
from typing import NamedTuple

class Item(NamedTuple):
    name: str
    price: float = 0.0

print(Item("pen"))            # Item(name='pen', price=0.0)
```

| Call | Does |
| --- | --- |
| `t.count(x)` | how many times x appears |
| `t.index(x)` | first index of x, `ValueError` if missing |
| `len(t)`, `x in t`, `t + u`, `t * 2` | same as for lists |
| `tuple(it)` / `list(t)` | convert to and from a list |

### Gotchas

- `(5)` is just 5. A one-item tuple needs a trailing comma: `(5,)`.
- Tuples are immutable, but a list inside one can still change: `t = ([1],)` then `t[0].append(2)` works.
- A tuple holding a list is not hashable, so it can't be a dict key.
- A stray trailing comma, as in `x = 1,`, quietly makes a tuple.
