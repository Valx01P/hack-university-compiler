# Math and Built-in Methods

Java has no free-standing built-in functions. The everyday ones live as static methods on classes: `Math`, the wrapper classes (`Integer`, `Double`, `Character`), `Arrays`, and `Collections`. `Math` needs no import.

### Min, max, abs

```java
Math.max(3, 7);          // 7
Math.min(-2, 5);         // -2
Math.max(2, 3.5);        // 3.5, mixing int and double gives a double
Math.abs(-4);            // 4
Math.max(1, Math.max(5, 3)); // 5, nest for three values
```

### Powers and roots

```java
Math.pow(2, 10);         // 1024.0, always a double
int p = (int) Math.pow(3, 4); // 81, cast for an int
Math.sqrt(49);           // 7.0
Math.cbrt(27);           // 3.0
Math.hypot(3, 4);        // 5.0
```

### Rounding

```java
Math.round(2.5);         // 3 (a long)
Math.round(-2.5);        // -2, rounds half up
Math.floor(2.7);         // 2.0
Math.ceil(2.1);          // 3.0
int t = (int) 2.99;      // 2, a cast truncates toward zero
Math.floorDiv(-7, 2);    // -4, while -7 / 2 is -3
Math.floorMod(-7, 3);    // 2, while -7 % 3 is -1
```

### Constants and logs

```java
double pi = Math.PI;     // 3.141592653589793
double e = Math.E;       // 2.718281828459045
Math.log(Math.E);        // 1.0, natural log
Math.log10(1000);        // 3.0
Math.signum(-8.0);       // -1.0
```

### Integer, Double, and Character

```java
Integer.parseInt("123");         // 123
Integer.parseInt("ff", 16);      // 255
Integer.toString(255, 16);       // "ff"
Integer.compare(3, 9);           // -1
Integer.sum(2, 3);               // 5, handy as Integer::sum
Double.parseDouble("2.5");       // 2.5
Character.isDigit('7');          // true
Character.toUpperCase('q');      // 'Q'
```

### Sum, min, and max of a collection

```java
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

int[] a = {4, 1, 3};
Arrays.stream(a).sum();                      // 8
Arrays.stream(a).max().getAsInt();           // 4
Arrays.stream(a).average().getAsDouble();    // 2.6666666666666665

List<Integer> list = List.of(5, 2, 8, 2);
Collections.max(list);                       // 8
Collections.min(list);                       // 2
Collections.frequency(list, 2);              // 2
```

### Random

```java
int roll = (int) (Math.random() * 6) + 1;   // 1 to 6, no import
```

For seeded or typed random values, use `java.util.Random` (see Standard Library).

### Use it in a loop: track max, min, and total

```java
int[] scores = {72, 95, 61, 88};
int best = Integer.MIN_VALUE;
int worst = Integer.MAX_VALUE;
int total = 0;
for (int s : scores) {
    best = Math.max(best, s);
    worst = Math.min(worst, s);
    total += s;
}
double avg = (double) total / scores.length;
System.out.println(best + " " + worst + " " + avg); // 95 61 79.0
```

### Cheat table

| Call | Does |
| --- | --- |
| `Math.max(a, b)` / `Math.min(a, b)` | larger or smaller of two |
| `Math.abs(x)` | absolute value |
| `Math.pow(b, e)` | `b` to the power `e`, as a `double` |
| `Math.sqrt(x)` | square root, as a `double` |
| `Math.round(x)` | nearest whole number, as a `long` |
| `Math.floor(x)` / `Math.ceil(x)` | round down or up, as a `double` |
| `Math.floorMod(a, b)` | remainder that is never negative for positive `b` |
| `Math.random()` | `double` from `0.0` up to, not including, `1.0` |
| `Integer.parseInt(s)` | `String` to `int` |
| `String.valueOf(x)` | anything to `String` |

### Gotchas

- `Math.pow` and `Math.sqrt` return `double`. Cast with `(int)` when you need an int, and watch for `Math.pow(10, 2)` printing `100.0`.
- `Math.round(x)` returns a `long`, so `int n = Math.round(2.5);` does not compile. Cast it: `(int) Math.round(2.5)`.
- `Math.abs(Integer.MIN_VALUE)` is still negative, because the positive value doesn't fit in an `int`.
- `total / count` with two ints drops the fraction before any `Math` call. Cast first: `(double) total / count`.
