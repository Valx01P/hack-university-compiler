# Switch

Java 15 has two forms. The classic `case X:` form falls through to the next case until a `break`. The arrow form `case X ->` (Java 14+) never falls through and can produce a value as a switch expression. Both work on `int`, `char`, `String`, and enums, but not on `long`, `double`, or `boolean`.

### Arrow form (preferred)

```java
int day = 6;
switch (day) {
    case 1, 2, 3, 4, 5 -> System.out.println("weekday");
    case 6, 7 -> System.out.println("weekend");
    default -> System.out.println("invalid");
}
// weekend
```

### Switch expression (returns a value)

```java
String cmd = "halt";
int code = switch (cmd) {
    case "go" -> 1;
    case "stop", "halt" -> 0;
    default -> -1;
};
System.out.println(code);  // 0
```

A switch expression must cover every value, so it needs a `default` unless it lists every enum constant. Note the `;` after the closing brace.

### Several statements in one case: yield

```java
int n = 7;
String kind = switch (n % 3) {
    case 0 -> "multiple of 3";
    default -> {
        int rem = n % 3;
        yield "remainder " + rem;   // yield gives the block's value
    }
};
System.out.println(kind);  // remainder 1
```

### Classic form with break

```java
char grade = 'B';
switch (grade) {
    case 'A':
        System.out.println("excellent");
        break;
    case 'B':
    case 'C':                 // B falls through to here on purpose
        System.out.println("passing");
        break;
    default:
        System.out.println("try again");
}
// passing
```

### Enums

Case labels use the bare constant name (`RED`, not `Color.RED`).

```java
enum Color { RED, GREEN, BLUE }   // after Main, or nested inside it

Color c = Color.GREEN;
String hex = switch (c) {
    case RED -> "#f00";
    case GREEN -> "#0f0";
    case BLUE -> "#00f";
};   // no default needed: every constant is covered
System.out.println(hex);  // #0f0
```

### Use it in a loop

```java
String[] ops = {"+", "-", "*", "?"};
int a = 6, b = 3;
for (String op : ops) {
    int result = switch (op) {
        case "+" -> a + b;
        case "-" -> a - b;
        case "*" -> a * b;
        default -> 0;
    };
    System.out.print(result + " ");
}
// 9 3 18 0
```

`break` inside a switch leaves the switch, not the loop. Label the loop to get out of both:

```java
outer:
for (String line : new String[] {"a", "quit", "b"}) {
    switch (line) {
        case "quit" -> {
            break outer;
        }
        default -> System.out.println(line);
    }
}
// a
```

### Gotchas

- In the classic form a missing `break` runs straight into the next case's code.
- One switch can't mix `case X:` and `case X ->` labels.
- Switching on a `null` String or enum throws `NullPointerException`. There are no ranges like `case 1..5`, use `if` / `else if` for those.
- Type patterns like `case Integer i ->` are Java 21, not available here.
