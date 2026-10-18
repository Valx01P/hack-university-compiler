# Methods

Every function in Java is a method inside a class. In a one-file program, write them as `static` methods in `Main` next to `main`, and give every parameter and the return value a type.

### Define and call

```java
public class Main {
    static int add(int a, int b) {
        return a + b;
    }

    static void greet(String name) {      // void returns nothing
        System.out.println("Hi " + name);
    }

    public static void main(String[] args) {
        int sum = add(2, 3);              // 5
        greet("Ana");                     // Hi Ana
    }
}
```

### Return early

```java
static boolean isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) return false;
    }
    return true;
}
// isPrime(7) is true, isPrime(9) is false
```

### Overloading instead of default arguments

```java
static double area(double side) {
    return side * side;
}

static double area(double w, double h) {   // same name, different parameters
    return w * h;
}
// area(3) is 9.0, area(2, 5) is 10.0
```

### Varargs

```java
static int total(int... nums) {   // nums is an int[]
    int sum = 0;
    for (int n : nums) sum += n;
    return sum;
}
// total() is 0, total(1, 2, 3) is 6
```

### Pass by value

Java copies every argument. For an array or object it copies the reference, so the method can change the contents but not the caller's variable.

```java
static void doubleAll(int[] arr) {
    for (int i = 0; i < arr.length; i++) arr[i] *= 2;  // caller sees this
}

static void reset(int x) {
    x = 0;                                // caller's variable is unchanged
}
```

To return several values, see Tuples and Pairs.

### Recursion

```java
static long factorial(int n) {
    if (n <= 1) return 1;                 // base case
    return n * factorial(n - 1);
}
// factorial(10) is 3628800
```

### Generic method

```java
import java.util.List;

static <T> T last(List<T> items) {
    return items.get(items.size() - 1);
}
// last(List.of("a", "b")) is "b"
```

### Lambdas and method references

```java
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.Predicate;

Function<Integer, Integer> square = x -> x * x;
BiFunction<Integer, Integer, Integer> mul = (a, b) -> a * b;
Predicate<String> isLong = s -> s.length() > 3;
Function<String, Integer> len = String::length;   // method reference

square.apply(5);         // 25
mul.apply(3, 4);         // 12
isLong.test("java");     // true
len.apply("hi");         // 2
```

### Use it in a loop

```java
for (int n = 1; n <= 10; n++) {
    if (isPrime(n)) {
        System.out.print(n + " "); // 2 3 5 7
    }
}
```

### Functional interfaces

| Type | Shape | Call it with |
| --- | --- | --- |
| `Function<T, R>` | `T -> R` | `apply(t)` |
| `BiFunction<T, U, R>` | `(T, U) -> R` | `apply(t, u)` |
| `Predicate<T>` | `T -> boolean` | `test(t)` |
| `Consumer<T>` | `T -> void` | `accept(t)` |
| `Supplier<T>` | `() -> T` | `get()` |
| `Runnable` | `() -> void` | `run()` |

### Gotchas

- Calling a method without `static` from `main` fails with "non-static method cannot be referenced from a static context". Mark helpers `static`.
- Every path of a non-void method must `return` a value, or it won't compile.
- Java has no default or named arguments. Overload the method instead.
- Recursion with no reachable base case throws `StackOverflowError`. Very deep but correct recursion can too, so use a loop for long chains.
