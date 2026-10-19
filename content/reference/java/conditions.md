# Conditions and Logic

A condition in Java must be a `boolean`. There is no truthiness: `0`, `null`, and `""` are not false, so `if (count)` does not compile. Compare with `== != < > <= >=` and combine with `&&`, `||`, and `!`.

### Comparison operators

| Operator | Means | Example with `a = 5` |
| --- | --- | --- |
| `==` | equal (primitives) | `a == 5` is `true` |
| `!=` | not equal | `a != 5` is `false` |
| `<` | less than | `a < 5` is `false` |
| `>` | greater than | `a > 3` is `true` |
| `<=` | at most | `a <= 5` is `true` |
| `>=` | at least | `a >= 6` is `false` |

### Logical operators

```java
int age = 20;
boolean member = true;
System.out.println(age >= 18 && member);    // true, both must be true
System.out.println(age < 12 || age >= 65);  // false, at least one must be true
System.out.println(!member);                // false
System.out.println((age > 18) ^ member);    // false, XOR: exactly one is true
System.out.println(age >= 13 && age <= 19); // false, no 13 <= age <= 19 chaining
```

Precedence, highest first: `!`, then comparisons, then `&&`, then `||`. Add parentheses when you mix `&&` and `||`.

### Short-circuit

`&&` stops at the first `false` and `||` stops at the first `true`, so the left side can guard the right.

```java
int total = 50, count = 0;
if (count > 0 && total / count > 10) {   // the division never runs, so no crash
    System.out.println("high average");
}
System.out.println(count > 0 && total / count > 10); // false, without dividing by zero
```

The same guard protects against `null`: `name != null && name.length() > 3` (see Infinity and Null).

### Compare strings and objects

```java
String a = "hello";
String b = new String("hello");
System.out.println(a.equals(b));                 // true, compares contents
System.out.println(a == b);                      // false, compares references
System.out.println(a.equalsIgnoreCase("HELLO")); // true
System.out.println("apple".compareTo("banana")); // -1, negative, "apple" sorts first

Integer p = 1000, q = 1000;
System.out.println(p == q);        // false, two different Integer objects
System.out.println(p.equals(q));   // true
```

### Compare doubles

```java
double x = 0.1 + 0.2;
System.out.println(x == 0.3);                 // false
System.out.println(Math.abs(x - 0.3) < 1e-9); // true
```

### Methods that return boolean

| Call | Does |
| --- | --- |
| `s.equals(t)` | same text |
| `s.equalsIgnoreCase(t)` | same text, any case |
| `s.isEmpty()` | length is 0 |
| `s.isBlank()` | empty or only whitespace (Java 11+) |
| `s.contains("x")` | has the substring |
| `s.startsWith("x")` | begins with it (also `endsWith`) |
| `Character.isDigit(c)` | `'0'` to `'9'` |
| `Character.isLetter(c)` | a letter |
| `list.contains(x)` | element is in the list (uses `equals`) |
| `Objects.equals(a, b)` | `equals` that handles `null` (`java.util.Objects`) |

### Use it in a loop: count matches

```java
int[] nums = {4, 15, 8, 23, 42, 7};
int count = 0;
for (int n : nums) {
    if (n % 2 == 0 && n > 5) {
        count++;
    }
}
System.out.println(count);  // 2 (8 and 42)
```

### Gotchas

- `==` on strings compares references, not text. Always use `s.equals(t)`.
- `Integer` objects compared with `==` work for small values (-128 to 127, which are cached) and fail above that. Use `.equals`, or unbox to `int`.
- `if (done = true)` compiles and always runs, because `=` assigns. Write `if (done)`.
- `&` and `|` also work on booleans but evaluate both sides, so `count > 0 & total / count > 10` still divides by zero.
