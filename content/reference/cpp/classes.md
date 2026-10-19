# Classes and Objects

A `class` bundles data and the functions that work on it. Members are `private` by default in a `class` and `public` by default in a `struct`. Use `struct` for plain data and `class` when you hide data behind methods. Don't forget the `;` after the closing brace.

### Define a class

```cpp
#include <iostream>
#include <string>
#include <utility>

class Dog {
public:
    Dog(std::string name, int age) : name_(std::move(name)), age_(age) {}  // constructor

    void bark() const {                  // const: doesn't change the object
        std::cout << name_ << " says woof\n";
    }
    int age() const { return age_; }     // getter
    void setAge(int a) { if (a >= 0) age_ = a; }  // setter with a check

private:
    std::string name_;
    int age_;
};   // <- semicolon
```

### Create and use objects

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Dog {
public:
    Dog(std::string name, int age) : name_(std::move(name)), age_(age) {}
    void bark() const { std::cout << name_ << " says woof\n"; }
    int age() const { return age_; }
    void setAge(int a) { if (a >= 0) age_ = a; }
private:
    std::string name_;
    int age_;
};

int main() {
    {{code}}
    std::cout << d.age() << '\n';
}
```

```cpp
Dog d("Rex", 3);         // on the stack, freed automatically
Dog e{"Fido", 5};        // brace init works too
d.bark();                // Rex says woof
d.setAge(4);
d.age();                 // 4

Dog* p = &d;             // pointer to an object
p->bark();               // -> instead of . through a pointer
```

### Struct for plain data

```cpp
struct Point {
    int x = 0;           // default member values
    int y = 0;
};

Point a;                 // {0, 0}
Point b{3, 4};           // aggregate init, in member order
b.x = 10;
```

### Constructors

```cpp
class Box {
public:
    Box() : w_(1), h_(1) {}                 // default constructor
    explicit Box(int side) : Box(side, side) {}   // delegates, explicit forbids Box b = 5;
    Box(int w, int h) : w_(w), h_(h) {}
    int area() const { return w_ * h_; }
private:
    int w_, h_;
};

Box a;          // 1x1   (not Box a(); that declares a function)
Box b(5);       // 5x5
Box c(2, 3);    // 2x3
```

### Static members

```cpp
class Counter {
public:
    Counter() { count++; }
    static int count;                  // shared by all objects
    static int total() { return count; }
};
int Counter::count = 0;               // define it once, outside the class

Counter x, y;
std::cout << Counter::total();        // 2
```

In C++17 you can write `inline static int count = 0;` inside the class instead.

### Print an object with `<<`

```cpp harness
struct Point {
    int x = 0;
    int y = 0;
};

{{code}}
```

```cpp
#include <iostream>

std::ostream& operator<<(std::ostream& os, const Point& p) {
    return os << '(' << p.x << ", " << p.y << ')';
}

std::cout << Point{3, 4};   // (3, 4)
```

### Objects in a loop

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Dog {
public:
    Dog(std::string name, int age) : name_(std::move(name)), age_(age) {}
    void bark() const { std::cout << name_ << " says woof\n"; }
    int age() const { return age_; }
    void setAge(int a) { if (a >= 0) age_ = a; }
private:
    std::string name_;
    int age_;
};

int main() {
    {{code}}
    std::cout << total << '\n';
}
```

```cpp
#include <vector>

std::vector<Dog> dogs;
dogs.emplace_back("Rex", 3);    // builds the Dog in place
dogs.push_back(Dog("Max", 7));

for (const Dog& d : dogs) {     // const& avoids copying each Dog
    d.bark();
}

int total = 0;
for (const auto& d : dogs) total += d.age();   // 10
```

| Keyword | Means |
|---|---|
| `public:` / `private:` | who can use the members that follow |
| `const` after `()` | the method doesn't change the object |
| `this` | pointer to the current object (`this->name_`) |
| `static` | belongs to the class, not each object |
| `explicit` | constructor can't be used for implicit conversions |

### Gotchas

- Missing `;` after the class body gives a confusing error on the *next* line.
- `Box a();` declares a function. Write `Box a;` or `Box a{};`.
- Members are initialized in the order they are declared, not the order in the `:` list.
- A method called on a `const` object (or through `const&`) must be marked `const`, or it won't compile.
