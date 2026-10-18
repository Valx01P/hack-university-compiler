# Classes and Objects

A class bundles data (attributes) and functions (methods). Every method takes the instance as its first parameter, `self`, and `__init__` sets up a new object. There is no `new` keyword: call the class like a function.

### Define and create

```python
class Dog:
    species = "canine"            # class attribute, shared by all dogs

    def __init__(self, name, age=1):
        self.name = name          # instance attributes
        self.age = age

    def bark(self):
        return f"{self.name} says woof"

rex = Dog("Rex", 3)
print(rex.bark())                 # Rex says woof
print(rex.age, rex.species)       # 3 canine
rex.age += 1                      # attributes are public
print(rex.age)                    # 4
```

### Printing and comparing

```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __repr__(self):           # used by print, lists, and the REPL
        return f"Point({self.x}, {self.y})"

    def __eq__(self, other):      # == compares identity unless you define this
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

p = Point(1, 2)
print(p)                          # Point(1, 2)
print([p, Point(0, 0)])           # [Point(1, 2), Point(0, 0)]
print(p == Point(1, 2))           # True
```

Define `__str__` too when the user-facing text should differ from the debug text. `print` prefers `__str__` and falls back to `__repr__`.

### Dataclasses (less boilerplate)

```python
from dataclasses import dataclass, field

@dataclass
class Item:
    name: str
    price: float
    tags: list[str] = field(default_factory=list)   # never use [] as a default

a = Item("pen", 1.5)
print(a)                          # Item(name='pen', price=1.5, tags=[])
print(a == Item("pen", 1.5))      # True
```

`@dataclass` writes `__init__`, `__repr__`, and `__eq__` for you. Add `order=True` for `<` and sorting, or `frozen=True` for read-only, hashable objects.

### Properties

```python
class Temp:
    def __init__(self, celsius):
        self._c = celsius             # leading _ means "internal"

    @property
    def fahrenheit(self):             # read like an attribute
        return self._c * 9 / 5 + 32

    @property
    def celsius(self):
        return self._c

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("below absolute zero")
        self._c = value

t = Temp(100)
print(t.fahrenheit)               # 212.0
t.celsius = 0
print(t.fahrenheit)               # 32.0
```

### Objects in a loop

```python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

accounts = [Account("ana", 50), Account("bo")]
for acc in accounts:
    acc.deposit(10)
richest = max(accounts, key=lambda a: a.balance)
print(richest.owner, richest.balance)          # ana 60
by_owner = {a.owner: a for a in accounts}
print(by_owner["bo"].balance)                  # 10
```

| Call | Does |
| --- | --- |
| `isinstance(obj, Dog)` | True if obj is a Dog or a subclass |
| `type(obj).__name__` | the class name as a string |
| `hasattr(obj, "name")` | does the attribute exist |
| `getattr(obj, "name", default)` | read an attribute by name |
| `setattr(obj, "name", value)` | set an attribute by name |
| `vars(obj)` | the instance's attributes as a dict |

### Gotchas

- Forgetting `self`: a method needs `self` as its first parameter, and attributes need `self.` in front, or they are just local variables.
- A mutable class attribute (`items = []` in the class body) is shared by every instance. Create it in `__init__` instead.
- Without `__repr__`, `print` shows `<__main__.Dog object at 0x...>`. Without `__eq__`, `==` is `True` only for the same object.
- Defining `__eq__` makes instances unhashable (no sets, no dict keys) until you also define `__hash__`, as in More OOP.
