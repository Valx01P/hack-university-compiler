# More OOP

Inheritance, abstract classes, class and static methods, and operator overloading through "dunder" (double underscore) methods. Python is duck typed: any object with the right methods works, whether or not it shares a base class.

### Inheritance and super()

```python
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return "..."

    def intro(self):
        return f"{self.name}: {self.speak()}"

class Dog(Animal):
    def __init__(self, name, breed):
        super().__init__(name)        # run the parent's __init__
        self.breed = breed

    def speak(self):                  # override
        return "Woof"

class Cat(Animal):
    def speak(self):
        return "Meow"

for pet in [Dog("Rex", "lab"), Cat("Tom"), Animal("Generic")]:
    print(pet.intro())                # Rex: Woof, Tom: Meow, Generic: ...
print(isinstance(Dog("a", "b"), Animal), issubclass(Cat, Dog))   # True False
```

### Abstract base classes

```python
from abc import ABC, abstractmethod
import math

class Shape(ABC):
    @abstractmethod
    def area(self): ...

    def describe(self):               # shared, concrete method
        return f"{type(self).__name__} with area {self.area():.2f}"

class Circle(Shape):
    def __init__(self, r):
        self.r = r

    def area(self):
        return math.pi * self.r ** 2

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side ** 2

for s in [Circle(1), Square(3)]:
    print(s.describe())               # Circle with area 3.14, Square with area 9.00
```

`Shape()` raises `TypeError` because it has an abstract method. A subclass must implement every one before it can be created.

### classmethod and staticmethod

```python
class Date:
    def __init__(self, y, m, d):
        self.y, self.m, self.d = y, m, d

    @classmethod
    def parse(cls, text):             # alternate constructor, gets the class
        return cls(*map(int, text.split("-")))

    @staticmethod
    def is_leap(y):                   # plain function grouped in the class
        return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)

d = Date.parse("2024-03-01")
print(d.m, Date.is_leap(2024))        # 3 True
```

### Operator overloading

```python
class Vec:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __add__(self, other):         # self + other
        return Vec(self.x + other.x, self.y + other.y)

    def __mul__(self, k):             # self * k
        return Vec(self.x * k, self.y * k)

    def __eq__(self, other):
        if not isinstance(other, Vec):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

    def __lt__(self, other):          # enables sorted()
        return (self.x, self.y) < (other.x, other.y)

    def __repr__(self):
        return f"Vec({self.x}, {self.y})"

print(Vec(1, 2) + Vec(3, 4))          # Vec(4, 6)
print(Vec(1, 2) * 3)                  # Vec(3, 6)
print(sorted([Vec(2, 0), Vec(1, 5)])) # [Vec(1, 5), Vec(2, 0)]
print(len({Vec(1, 1), Vec(1, 1)}))    # 1
```

| Method | Makes this work |
| --- | --- |
| `__repr__`, `__str__` | `repr(x)`, `print(x)`, `f"{x}"` |
| `__eq__`, `__hash__` | `==`, use as dict key or set item |
| `__lt__`, `__le__` | `<`, `<=`, `sorted`, `min`, `max` |
| `__add__`, `__sub__`, `__mul__` | `+`, `-`, `*` |
| `__len__` | `len(x)` |
| `__getitem__` | `x[i]`, and looping if there is no `__iter__` |
| `__contains__` | `item in x` |
| `__iter__` | `for item in x` |
| `__call__` | `x()` |
| `__enter__`, `__exit__` | `with x:` |

### A custom container

```python
class Playlist:
    def __init__(self, *songs):
        self._songs = list(songs)         # composition: has a list

    def __len__(self):
        return len(self._songs)

    def __getitem__(self, i):
        return self._songs[i]

    def __iter__(self):
        return iter(self._songs)

    def __contains__(self, song):
        return song in self._songs

p = Playlist("intro", "song", "outro")
print(len(p), p[0], p[-1])            # 3 intro outro
print("song" in p)                    # True
for i, song in enumerate(p, 1):
    print(i, song)                    # 1 intro, 2 song, 3 outro
```

### Generics and overrides (3.12)

```python
from typing import override

class Stack[T]:                       # new 3.12 type parameter syntax
    def __init__(self) -> None:
        self.items: list[T] = []

    def push(self, item: T) -> None:
        self.items.append(item)

class LoudStack[T](Stack[T]):
    @override                         # type checkers flag a typo'd name
    def push(self, item: T) -> None:
        print("push", item)
        super().push(item)

s = LoudStack[int]()
s.push(5)                             # push 5
```

Type hints are not enforced at run time. They are for readers and tools.

### Gotchas

- Calling the parent's method needs `super().method(...)`. Forgetting `super().__init__(...)` leaves the parent's attributes unset.
- Return `NotImplemented`, not `False` or an exception, from `__eq__` or `__add__` when the other type is unknown. Python then tries the other operand.
- `__private` names get mangled to `_ClassName__private`. Use a single `_` for "internal", which is the usual convention.
- With multiple inheritance, methods resolve in `Class.__mro__` order. Prefer composition when a class just needs to use another.
