# Infinity and Null

Only `double` and `float` have infinity and NaN. `int` and `long` have no infinity, so use `Integer.MAX_VALUE` as a stand-in. `null` means "no object" and fits any reference type (`String`, `Integer`, arrays, lists), never a primitive.

### At a glance

| Value | Spelling |
| --- | --- |
| positive infinity | `Double.POSITIVE_INFINITY` |
| negative infinity | `Double.NEGATIVE_INFINITY` |
| not a number | `Double.NaN` |
| largest `int` | `Integer.MAX_VALUE` (2147483647) |
| smallest `int` | `Integer.MIN_VALUE` (-2147483648) |
| largest `long` | `Long.MAX_VALUE` |
| largest finite `double` | `Double.MAX_VALUE` |
| smallest positive `double` | `Double.MIN_VALUE` (greater than 0, not negative) |
| no object | `null` |

### Infinity

```java
double inf = Double.POSITIVE_INFINITY;
double negInf = Double.NEGATIVE_INFINITY;
double alsoInf = 1.0 / 0;                         // no exception for doubles
System.out.println(inf);                          // Infinity
System.out.println(negInf);                       // -Infinity
System.out.println(inf > Double.MAX_VALUE);       // true
System.out.println(inf + 1 == inf);               // true
System.out.println(Double.isInfinite(alsoInf));   // true
```

### NaN

```java
double nan = 0.0 / 0;
System.out.println(nan);                 // NaN
System.out.println(Math.sqrt(-1));       // NaN
System.out.println(nan == nan);          // false
System.out.println(Double.isNaN(nan));   // true
```

### int stand-ins in a loop

```java
int min = Integer.MAX_VALUE, max = Integer.MIN_VALUE;
for (int n : new int[] {7, 3, 9}) {
    min = Math.min(min, n);
    max = Math.max(max, n);
}
System.out.println(min + " " + max);  // 3 9
```

### null

```java
String name = null;                  // any reference type can be null
Integer count = null;                // wrapper types too
// int n = null;                     // error: primitives can't be null
System.out.println(name);            // null
System.out.println(name == null);    // true
System.out.println("Hi " + name);    // Hi null
```

Fields of reference type start as `null`, and so does every slot of a new object array:

```java
String[] words = new String[3];
System.out.println(words[0]);  // null
```

### Handle null safely

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

String name = null;
if (name != null && name.length() > 3) {     // && skips the right side
    System.out.println("long name");
}
System.out.println("Ada".equals(name));                         // false, no crash
System.out.println(Objects.requireNonNullElse(name, "guest"));  // guest
System.out.println(Optional.ofNullable(name).orElse("guest"));  // guest

Map<String, Integer> ages = new HashMap<>();
Integer age = ages.get("Bob");
System.out.println(age);                     // null, key missing
int safe = ages.getOrDefault("Bob", 0);
System.out.println(safe);                    // 0
```

### Gotchas

- Calling a method on `null` throws `NullPointerException`: `name.length()` when `name` is `null`. Check first, or put the literal on the left: `"Ada".equals(name)`.
- Unboxing `null` also throws: `int age = ages.get("Bob");` crashes when the key is missing.
- `NaN == NaN` is `false`. Test with `Double.isNaN(x)`.
- `Integer.MAX_VALUE + 1` wraps to a negative number, so never add to an `int` "infinity". Use `Integer.MAX_VALUE / 2` or `long` when you need room.
