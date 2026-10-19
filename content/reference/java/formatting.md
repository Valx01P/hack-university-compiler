# Printing Variables

Join values into text with `+`, or format them with `printf`, `String.format`, or `"...".formatted(...)`. `printf` does not end the line, so finish the pattern with `%n`.

### Concatenation with +

```java
String name = "Ada";
int age = 36;
System.out.println("Name: " + name + ", age " + age);  // Name: Ada, age 36
System.out.println("Next year: " + (age + 1));         // Next year: 37
System.out.println(name + age * 2);                     // Ada72
```

### printf

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String name = "Ada";
        {{code}}
    }
}
```

```java
double price = 4.5;
System.out.printf("%s owes $%.2f%n", name, price);   // Ada owes $4.50
System.out.printf("%d%% done%n", 80);                 // 80% done
```

### Format into a String

```java
String a = String.format("%d items", 3);       // "3 items"
String b = "%s is %d".formatted("Ada", 36);    // "Ada is 36" (Java 15)
String c = String.format("%05.1f", 3.14159);   // "003.1"
```

### Format specifiers

| Spec | Example | Result |
| --- | --- | --- |
| `%d` | `printf("%d", 42)` | `42` |
| `%5d` | `printf("%5d", 42)` | `   42` (right-aligned, width 5) |
| `%-5d` | `printf("%-5d!", 42)` | `42   !` (left-aligned) |
| `%05d` | `printf("%05d", 42)` | `00042` |
| `%,d` | `printf("%,d", 1234567)` | `1,234,567` |
| `%f` | `printf("%f", 3.14159)` | `3.141590` (6 decimals) |
| `%.2f` | `printf("%.2f", 3.14159)` | `3.14` |
| `%8.2f` | `printf("%8.2f", 3.14159)` | `    3.14` |
| `%e` | `printf("%e", 12345.0)` | `1.234500e+04` |
| `%s` | `printf("%s", "hi")` | `hi` (any object, via `toString`) |
| `%10s` | `printf("%10s", "hi")` | `        hi` |
| `%-10s` | `printf("%-10s!", "hi")` | `hi        !` |
| `%c` | `printf("%c", 'A')` | `A` |
| `%b` | `printf("%b", true)` | `true` |
| `%x` | `printf("%x", 255)` | `ff` |
| `%%` | `printf("100%%")` | `100%` |
| `%n` | `printf("a%nb")` | a newline |

### Text block template

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String name = "Ada";
        int age = 36;
        {{code}}
    }
}
```

```java
String card = """
    Name: %s
    Age:  %d
    """.formatted(name, age);
System.out.print(card);
// Name: Ada
// Age:  36
```

### Use it in a loop: aligned columns

```java
String[] items = {"apple", "kiwi", "banana"};
double[] prices = {1.5, 0.25, 12};
for (int i = 0; i < items.length; i++) {
    System.out.printf("%-8s%6.2f%n", items[i], prices[i]);
}
// apple     1.50
// kiwi      0.25
// banana   12.00
```

### Gotchas

- `"Total: " + 1 + 2` gives `Total: 12`. Put arithmetic in parentheses: `"Total: " + (1 + 2)`.
- `printf` without `%n` or `\n` leaves the cursor on the same line, so the next print runs into it.
- A specifier that doesn't match the type fails at runtime: `printf("%d", 3.5)` throws `IllegalFormatConversionException`. Use `%f` for `double`, `%d` for `int` and `long`.
- More specifiers than arguments throws `MissingFormatArgumentException`.
