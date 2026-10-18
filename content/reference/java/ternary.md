# Ternary

`condition ? valueIfTrue : valueIfFalse` is an expression that picks one of two values. Use it for short picks inside an assignment, a return, or a print. Use `if` / `else` when you need to run statements.

### Pick a value

```java
int a = 7, b = 12;
int max = a > b ? a : b;                       // 12
String parity = a % 2 == 0 ? "even" : "odd";   // "odd"
```

### Inside a string

Wrap it in parentheses, because `+` binds tighter than `?`.

```java
int count = 1;
System.out.println(count + " item" + (count == 1 ? "" : "s"));  // 1 item
```

### Return it

```java
static String sign(int n) {
    return n > 0 ? "positive" : n < 0 ? "negative" : "zero";
}

System.out.println(sign(-3));  // negative
```

### Chained (else-if style)

Put each condition on its own line so it reads like a table.

```java
int score = 85;
String grade = score >= 90 ? "A"
             : score >= 80 ? "B"
             : score >= 70 ? "C"
             : "F";
System.out.println(grade);  // B
```

### Default for null

```java
String name = null;
String shown = name != null ? name : "guest";  // "guest"
```

### Use it in a loop: separators

```java
int[] nums = {3, 1, 4, 1, 5};
for (int i = 0; i < nums.length; i++) {
    System.out.print(nums[i] + (i < nums.length - 1 ? ", " : "\n"));
}
// 3, 1, 4, 1, 5
```

### Gotchas

- A ternary is not a statement: `x > 0 ? up() : down();` does not compile. Use `if` / `else`.
- Both sides are converted to one type: `true ? 1 : 2.0` is `1.0`.
- Mixing a wrapper and a primitive unboxes the wrapper, so `Integer n = null` then `Integer r = flag ? n : 0` throws `NullPointerException`.
- More than two levels of nesting gets hard to read. Switch to `if` / `else if` or a `switch`.
