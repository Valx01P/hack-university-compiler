# Variables and Types

Java is statically typed: you declare each variable with a type, and it keeps that type forever. A local variable must be assigned before you read it. Names are `camelCase`.

### Declare and assign

```java
int age = 30;
double price = 9.99;
boolean done = false;
char grade = 'A';            // single quotes, one character
String name = "Ada";         // double quotes, String is a class
long big = 9_000_000_000L;   // L suffix for long literals past the int range
float ratio = 0.5f;          // f suffix, rarely needed

int count;                   // declared, no value yet
count = 5;                   // assign before you read it
age = age + 1;               // reassign, same type only
System.out.println(age);     // 31
```

### Primitive types

| Type | Size | Range or note | Example |
| --- | --- | --- | --- |
| `byte` | 8 bits | -128 to 127 | `byte b = 100;` |
| `short` | 16 bits | -32,768 to 32,767 | `short s = 1000;` |
| `int` | 32 bits | about plus or minus 2.1 billion | `int n = 42;` |
| `long` | 64 bits | about plus or minus 9.2 * 10^18 | `long l = 42L;` |
| `float` | 32 bits | about 7 significant digits | `float f = 1.5f;` |
| `double` | 64 bits | about 15 digits, the default for decimals | `double d = 1.5;` |
| `char` | 16 bits | one UTF-16 character | `char c = 'x';` |
| `boolean` | not fixed | `true` or `false` | `boolean ok = true;` |

Everything else is a reference type: `String`, arrays, `ArrayList`, your own classes. Reference variables can hold `null`.

### var (type inference)

`var` works for local variables that are assigned on the same line. It is still static typing: the type is fixed from the value.

```java
import java.util.ArrayList;

var total = 0;                         // int
var avg = 2.5;                         // double
var word = "hi";                       // String
var names = new ArrayList<String>();   // ArrayList<String>
System.out.println(word + " " + avg);  // hi 2.5
// total = "zero";                     // error: incompatible types
```

### Constants

```java
final int MAX_SCORE = 100;      // can't be reassigned
// MAX_SCORE = 200;             // error: cannot assign a value to final variable
System.out.println(MAX_SCORE);  // 100
```

A constant shared by the whole class goes outside `main`:

```java
public class Main {
    static final double TAX_RATE = 0.08;  // ALL_CAPS by convention

    public static void main(String[] args) {
        System.out.println(TAX_RATE);  // 0.08
    }
}
```

### Wrapper types

Collections hold objects, so each primitive has a wrapper class. Java converts between them automatically (autoboxing).

```java
import java.util.ArrayList;
import java.util.List;

List<Integer> scores = new ArrayList<>();  // List<int> does not compile
scores.add(90);                            // int boxed to Integer
int first = scores.get(0);                 // Integer unboxed to int
System.out.println(first);                 // 90
```

| Primitive | Wrapper |
| --- | --- |
| `int` | `Integer` |
| `long` | `Long` |
| `double` | `Double` |
| `char` | `Character` |
| `boolean` | `Boolean` |

### Convert between types

```java
double d = 7;
System.out.println(d);         // 7.0, widening is automatic
int i = (int) 3.99;
System.out.println(i);         // 3, the cast drops the fraction
long r = Math.round(3.5);
System.out.println(r);         // 4, round returns long for a double
int wrapped = (int) 5_000_000_000L;
System.out.println(wrapped);   // 705032704, overflow
char c = (char) 66;
System.out.println(c);         // B
int code = 'A';
System.out.println(code);      // 65

int n = Integer.parseInt("42");          // String to int
double x = Double.parseDouble("3.14");   // String to double
String s = String.valueOf(42);           // int to String
System.out.println(s);                   // 42
String t = "" + 3.5;
System.out.println(t);                   // 3.5
```

### Limits

```java
System.out.println(Integer.MAX_VALUE);   // 2147483647
System.out.println(Integer.MIN_VALUE);   // -2147483648
System.out.println(Long.MAX_VALUE);      // 9223372036854775807
System.out.println(Double.MAX_VALUE);    // 1.7976931348623157E308
```

### Use it in a loop

A variable lives inside the braces where it is declared. Declare an accumulator before the loop to keep it afterward.

```java
int sum = 0;
for (int i = 1; i <= 4; i++) {
    int square = i * i;   // a fresh variable each pass
    sum += square;
}
System.out.println(sum);  // 30
// i and square don't exist here
```

### Gotchas

- Locals have no default value. Reading one before assigning it fails to compile ("might not have been initialized"). Fields default to `0`, `false`, or `null`.
- `float f = 1.5;` does not compile. Decimal literals are `double`, so write `1.5f` (or just use `double`).
- `long x = 3000000000;` does not compile. Integer literals past the `int` range need the `L` suffix.
- `Integer.parseInt("4.5")` throws `NumberFormatException`. Parse decimals with `Double.parseDouble`.
