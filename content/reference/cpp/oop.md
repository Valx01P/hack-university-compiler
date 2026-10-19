# Inheritance and Polymorphism

A class inherits with `class Dog : public Animal`. Polymorphism only happens through a pointer or reference to the base class, and only for methods marked `virtual`. Give every base class a `virtual` destructor.

### Inherit

```cpp
#include <iostream>
#include <string>
#include <utility>

class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;              // virtual destructor
    virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected:
    std::string name_;                        // visible to subclasses
};

class Dog : public Animal {
public:
    explicit Dog(std::string name) : Animal(std::move(name)) {}   // call the base constructor
    std::string sound() const override { return "woof"; }
};

Dog d("Rex");
d.name();    // "Rex", inherited
d.sound();   // "woof"
```

### Polymorphism

```cpp harness
class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;  virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected: std::string name_;
};
class Dog : public Animal { public: using Animal::Animal; std::string sound() const override { return "woof"; } };

{{code}}
```

```cpp
class Cat : public Animal {
public:
    using Animal::Animal;                      // reuse the base constructors
    std::string sound() const override { return "meow"; }
};

void speak(const Animal& a) {                  // reference to the base
    std::cout << a.name() << ": " << a.sound() << '\n';
}

Dog d("Rex");
Cat c("Tom");
speak(d);   // Rex: woof
speak(c);   // Tom: meow
```

### Mixed objects in a loop

Store pointers, not objects, or the subclass part gets sliced off. `std::unique_ptr` frees them for you.

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;  virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected: std::string name_;
};
class Dog : public Animal { public: using Animal::Animal; std::string sound() const override { return "woof"; } };
class Cat : public Animal { public: using Animal::Animal; std::string sound() const override { return "meow"; } };

int main() {
    {{code}}
}
```

```cpp
#include <memory>
#include <vector>

std::vector<std::unique_ptr<Animal>> zoo;
zoo.push_back(std::make_unique<Dog>("Rex"));
zoo.push_back(std::make_unique<Cat>("Tom"));

for (const auto& a : zoo) {
    std::cout << a->name() << " says " << a->sound() << '\n';
}
// Rex says woof
// Tom says meow
```

### Abstract classes (interfaces)

A pure virtual method `= 0` has no body. A class with one can't be created, and subclasses must override it.

```cpp
class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;           // pure virtual
    void describe() const { std::cout << "area " << area() << '\n'; }
};

class Rect : public Shape {
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
private:
    double w_, h_;
};

// Shape s;      // error: Shape is abstract
Rect r(2, 3);
r.describe();    // area 6
```

### Call the parent's version

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;  virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected: std::string name_;
};
class Dog : public Animal { public: using Animal::Animal; std::string sound() const override { return "woof"; } };

{{code}}

int main() {
    Puppy p("Rex");
    std::cout << p.name() << ": " << p.sound() << '\n';
}
```

```cpp
class Puppy : public Dog {
public:
    using Dog::Dog;
    std::string sound() const override {
        return Dog::sound() + "!";             // "woof!"
    }
};
```

### Operator overloading

```cpp
struct Vec {
    double x, y;
    Vec operator+(const Vec& o) const { return {x + o.x, y + o.y}; }
    Vec operator*(double k) const { return {x * k, y * k}; }
    bool operator==(const Vec& o) const { return x == o.x && y == o.y; }
    bool operator<(const Vec& o) const { return x < o.x; }   // lets std::sort and std::set work
};

Vec a{1, 2}, b{3, 4};
Vec c = a + b * 2;   // {7, 10}
```

### Smart pointers

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;  virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected: std::string name_;
};
class Dog : public Animal { public: using Animal::Animal; std::string sound() const override { return "woof"; } };

int main() {
    {{code}}
    std::cout << (p == nullptr) << ' ' << q->name() << '\n';
    std::cout << s1.use_count() << '\n';
}
```

```cpp
#include <memory>

auto p = std::make_unique<Dog>("Rex");    // one owner, freed automatically
auto q = std::move(p);                    // ownership moves, p is now null

auto s1 = std::make_shared<Dog>("Max");   // shared owners, freed with the last one
auto s2 = s1;
s1.use_count();                           // 2
```

### Check the real type

```cpp harness
#include <bits/stdc++.h>
using namespace std;

class Animal {
public:
    explicit Animal(std::string name) : name_(std::move(name)) {}
    virtual ~Animal() = default;  virtual std::string sound() const { return "..."; }
    std::string name() const { return name_; }
protected: std::string name_;
};
class Dog : public Animal { public: using Animal::Animal; std::string sound() const override { return "woof"; } };
class Cat : public Animal { public: using Animal::Animal; std::string sound() const override { return "meow"; } };

int main() {
    std::vector<std::unique_ptr<Animal>> zoo;
    zoo.push_back(std::make_unique<Dog>("Rex"));
    zoo.push_back(std::make_unique<Cat>("Tom"));
    {{code}}
}
```

```cpp
Animal* a = zoo[0].get();
if (auto* dog = dynamic_cast<Dog*>(a)) {   // null if a isn't a Dog
    std::cout << dog->name() << " is a dog\n";
}
```

| Keyword | Means |
|---|---|
| `virtual` | calls go to the subclass version through a base pointer or reference |
| `override` | compiler checks you really override a base method |
| `= 0` | pure virtual, makes the class abstract |
| `final` | can't be overridden (method) or inherited from (class) |
| `protected` | visible to subclasses, hidden from everyone else |
| `public` inheritance | base's public members stay public |

### Gotchas

- Without `virtual`, a base reference calls the base method even on a `Dog`.
- Always write `override`. A typo or a missing `const` otherwise makes a new method silently.
- Copying a `Dog` into an `Animal` variable (or a `std::vector<Animal>`) slices it into a plain `Animal`.
- Deleting a subclass through a base pointer without a `virtual` destructor is undefined behavior.
