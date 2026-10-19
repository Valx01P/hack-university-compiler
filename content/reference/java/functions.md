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
        int sum = add(2, 3);
        greet("Ana");                     // Hi Ana
        System.out.println(sum);          // 5
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
System.out.println(isPrime(7));  // true
System.out.println(isPrime(9));  // false
```

### Overloading instead of default arguments

```java
static double area(double side) {
    return side * side;
}

static double area(double w, double h) {   // same name, different parameters
    return w * h;
}
System.out.println(area(3));     // 9.0
System.out.println(area(2, 5));  // 10.0
```

### Varargs

```java
static int total(int... nums) {   // nums is an int[]
    int sum = 0;
    for (int n : nums) sum += n;
    return sum;
}
System.out.println(total());         // 0
System.out.println(total(1, 2, 3));  // 6
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
int[] nums = {1, 2};
int n = 5;
doubleAll(nums);
reset(n);
System.out.println(Arrays.toString(nums) + " " + n);  // [2, 4] 5
```

To return several values, see Tuples and Pairs.

### Recursion

```java
static long factorial(int n) {
    if (n <= 1) return 1;                 // base case
    return n * factorial(n - 1);
}
System.out.println(factorial(10));  // 3628800
```

### Generic method

```java
import java.util.List;

static <T> T last(List<T> items) {
    return items.get(items.size() - 1);
}
System.out.println(last(List.of("a", "b")));  // b
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

System.out.println(square.apply(5));      // 25
System.out.println(mul.apply(3, 4));      // 12
System.out.println(isLong.test("java"));  // true
System.out.println(len.apply("hi"));      // 2
```

### Use it in a loop

```java harness
import java.util.*;

public class Main {
    static boolean isPrime(int n) {
        if (n < 2) return false;
        for (int i = 2; i * i <= n; i++) {
            if (n % i == 0) return false;
        }
        return true;
    }

    public static void main(String[] args) throws Exception {
        {{code}}
    }
}
```

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
