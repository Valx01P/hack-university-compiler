# Inheritance and Interfaces

A class `extends` one parent and `implements` any number of interfaces. A variable of the parent or interface type can hold any subclass, and calls run the subclass's version (polymorphism). Classes go after `Main`, without `public`.

### extends and super

```java
class Animal {
    protected String name;            // visible to subclasses

    Animal(String name) { this.name = name; }

    String sound() { return "..."; }

    String describe() { return name + " says " + sound(); }
}

class Dog extends Animal {
    Dog(String name) {
        super(name);                  // parent constructor, must be the first line
    }

    @Override                         // compiler checks the signature matches
    String sound() { return "Woof"; }
}

class Puppy extends Dog {
    Puppy(String name) { super(name); }

    @Override
    String sound() { return super.sound() + " (tiny)"; } // parent's version
}

System.out.println(new Dog("Rex").describe());   // Rex says Woof
System.out.println(new Puppy("Bit").describe()); // Bit says Woof (tiny)
```

### Polymorphism in a loop

```java
import java.util.List;

List<Animal> zoo = List.of(new Animal("Generic"), new Dog("Rex"), new Puppy("Bit"));
for (Animal a : zoo) {
    System.out.println(a.describe());
}
// Generic says ...
// Rex says Woof
// Bit says Woof (tiny)
```

### Abstract classes

Can't be instantiated. Subclasses must fill in every `abstract` method.

```java
abstract class Shape {
    abstract double area();           // no body

    String info() {                   // normal methods are allowed
        return getClass().getSimpleName() + String.format(" %.2f", area());
    }
}

class Circle extends Shape {
    final double r;
    Circle(double r) { this.r = r; }

    @Override
    double area() { return Math.PI * r * r; }
}

class Rect extends Shape {
    final double w, h;
    Rect(double w, double h) { this.w = w; this.h = h; }

    @Override
    double area() { return w * h; }
}

for (Shape s : List.of(new Circle(1), new Rect(2, 3))) {
    System.out.println(s.info());     // Circle 3.14, then Rect 6.00
}
```

### Interfaces

A contract of methods. Implementing methods must be `public`.

```java
interface Speaker {
    String speak();                               // implicitly public abstract

    default String speakTwice() {                 // has a body
        return speak() + " " + speak();
    }
}

interface Mover {
    int speed();
}

class Robot implements Speaker, Mover {           // many interfaces
    @Override
    public String speak() { return "Beep"; }

    @Override
    public int speed() { return 5; }
}

Speaker sp = new Robot();
System.out.println(sp.speakTwice());              // Beep Beep
```

### Casting and instanceof

```java
Animal a = new Dog("Rex");          // upcast, automatic
if (a instanceof Dog) {
    Dog d = (Dog) a;                // downcast, explicit
    System.out.println(d.sound());  // Woof
}
```

### Comparable and Comparator

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

class Player implements Comparable<Player> {
    final String name;
    final int score;
    Player(String name, int score) { this.name = name; this.score = score; }

    @Override
    public int compareTo(Player o) {               // natural order: by score
        return Integer.compare(score, o.score);
    }

    @Override
    public String toString() { return name + ":" + score; }
}

List<Player> ps = new ArrayList<>(List.of(new Player("Ana", 9), new Player("Ben", 4), new Player("Cy", 9)));
Collections.sort(ps);                                 // [Ben:4, Ana:9, Cy:9]
ps.sort(Comparator.comparing((Player p) -> p.name).reversed()); // [Cy:9, Ben:4, Ana:9]
ps.sort(Comparator.comparingInt((Player p) -> p.score).reversed()
        .thenComparing(p -> p.name));                 // [Ana:9, Cy:9, Ben:4]
```

### Enums

```java
enum Planet {
    MERCURY(0.38), EARTH(1.0), MARS(0.38);

    final double gravity;
    Planet(double gravity) { this.gravity = gravity; }
}

for (Planet p : Planet.values()) {
    System.out.println(p + " " + p.gravity + " " + p.ordinal()); // MERCURY 0.38 0 ...
}
Planet.valueOf("MARS");   // MARS
```

### Generic class

```java
class Box<T> {
    private T value;
    Box(T value) { this.value = value; }
    T get() { return value; }
}

Box<String> b = new Box<>("hi");
String s = b.get();       // no cast needed
```

### Lambdas for one-method interfaces

A lambda can stand in for any interface with exactly one abstract method, including your own. The ready-made ones (`Function`, `Predicate`, ...) are in Methods.

```java
interface Op {                        // after Main
    int apply(int a, int b);
}

Op add = (x, y) -> x + y;
Op max = Math::max;                   // a method reference works too
add.apply(2, 3);          // 5
max.apply(2, 3);          // 3
```

### Abstract class or interface

| | Abstract class | Interface |
| --- | --- | --- |
| How many per class | one (`extends`) | many (`implements`) |
| Fields | any | constants only |
| Constructors | yes | no |
| Method bodies | yes | only `default` and `static` |
| Use for | shared code and state | a capability ("can speak") |

### Gotchas

- Without `@Override`, a typo like `String Sound()` silently adds a new method. Always write `@Override`.
- Java 15 has no `if (a instanceof Dog d)` pattern. Check with `instanceof`, then cast.
- Forgetting `public` on an interface method in the class fails with "attempting to assign weaker access privileges".
- A wrong downcast compiles but throws `ClassCastException` at runtime. Check `instanceof` first.
