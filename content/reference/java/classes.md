# Classes and Objects

Everything in Java lives in a class. In this compiler the file's first class must be `public class Main`, so put your own classes after it without `public`, or nest them inside `Main` as `static class`.

### Define a class

```java
class Dog {
    private String name;          // fields, private by convention
    private int age;

    Dog(String name, int age) {   // constructor: same name, no return type
        this.name = name;         // this.name is the field, name the parameter
        this.age = age;
    }

    void birthday() {             // instance method
        age++;
    }

    String getName() { return name; }
    int getAge() { return age; }
}
```

### Create and use

```java
Dog rex = new Dog("Rex", 3);
rex.birthday();
System.out.println(rex.getName() + " " + rex.getAge()); // Rex 4
```

### toString

Without it, printing shows something like `Dog@1b6d3586`.

```java
class Point {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }

    @Override
    public String toString() {    // must be public
        return "(" + x + ", " + y + ")";
    }
}

System.out.println(new Point(1, 2)); // (1, 2)
```

### Several constructors

```java
class Box {
    int w, h;
    Box(int w, int h) { this.w = w; this.h = h; }
    Box(int side) { this(side, side); }   // calls the other constructor
    Box() { this(1); }
}

System.out.println(new Box(4).h); // 4
```

### Static members

`static` belongs to the class, not to one object.

```java
class Counter {
    static int created = 0;       // shared by all Counters
    final int id;                 // final: set once in the constructor

    Counter() {
        created++;
        id = created;
    }

    static int total() { return created; }
}

new Counter();
new Counter();
System.out.println(Counter.total()); // 2
```

### equals and hashCode

`==` asks "same object?". Override `equals` (and always `hashCode` with it) to compare by value and to work as a `HashMap` key or `HashSet` element.

```java
import java.util.Objects;

class Card {
    final String suit;
    final int rank;
    Card(String suit, int rank) { this.suit = suit; this.rank = rank; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Card)) return false;
        Card c = (Card) o;
        return rank == c.rank && suit.equals(c.suit);
    }

    @Override
    public int hashCode() { return Objects.hash(suit, rank); }
}

Card a = new Card("hearts", 5);
Card b = new Card("hearts", 5);
System.out.println(a == b);      // false, two objects
System.out.println(a.equals(b)); // true, same value
```

### Objects in a loop

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

List<Dog> dogs = new ArrayList<>();
dogs.add(new Dog("Rex", 3));
dogs.add(new Dog("Ada", 7));
dogs.add(new Dog("Bo", 1));

dogs.sort(Comparator.comparingInt(Dog::getAge));
for (Dog d : dogs) {
    System.out.println(d.getName() + " " + d.getAge()); // Bo 1, Rex 3, Ada 7
}
```

### Modifiers

| Modifier | Means |
| --- | --- |
| `private` | visible in this class only |
| none | visible in this package (every class in one file here) |
| `protected` | visible in the package and subclasses |
| `public` | visible everywhere |
| `static` | belongs to the class, call as `Counter.total()` |
| `final` | field set once, method not overridable, class not extendable |

### Gotchas

- A nested class inside `Main` without `static` fails in `main` with "non-static variable this cannot be referenced from a static context". Write `static class Dog`.
- A class placed above `Main` fails with "can't find main(String[]) method in class". The runner starts the first class in the file.
- Fields default to `0`, `false`, or `null`. Calling a method on an unset object field throws `NullPointerException`.
- `record` (Java 16) is not available. Write the class with fields, a constructor, and `toString`.
