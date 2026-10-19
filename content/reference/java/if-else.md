# If and Else

The condition goes in parentheses and must be a `boolean`. There is no `elif`: write `else if`. Braces are optional around a single statement, but use them whenever the body could grow past one line.

### if, else if, else

```java
int temp = 72;
if (temp > 85) {
    System.out.println("hot");
} else if (temp > 60) {
    System.out.println("nice");
} else {
    System.out.println("cold");
}
// nice
```

Only the first true branch runs, so order the checks from most specific to least.

### One-line if

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int temp = 72;
        {{code}}
    }
}
```

```java
if (temp > 100) System.out.println("stay inside");   // legal, but easy to break later
```

### Nested

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int temp = 72;
        {{code}}
    }
}
```

```java
boolean raining = false;
if (temp > 60) {
    if (raining) {
        System.out.println("umbrella");
    } else {
        System.out.println("t-shirt");
    }
}
// t-shirt
```

### Assign a value from branches

The variable needs a value on every path, so finish with an `else`. For a simple two-way pick, a ternary is shorter (`cond ? a : b`).

```java
int score = 83;
String grade;
if (score >= 90) {
    grade = "A";
} else if (score >= 80) {
    grade = "B";
} else {
    grade = "C";
}
System.out.println(grade);  // B
```

### Early return (guard clauses)

```java
static String classify(int n) {
    if (n < 0) {
        return "negative";
    }
    if (n == 0) {
        return "zero";
    }
    return "positive";
}

System.out.println(classify(-4));  // negative
```

### Compare strings

```java
String cmd = "quit";
if (cmd.equals("quit")) {
    System.out.println("bye");
} else if (cmd.equalsIgnoreCase("help")) {
    System.out.println("commands: help, quit");
}
// bye
```

### Use it in a loop: FizzBuzz

```java
for (int i = 1; i <= 15; i++) {
    if (i % 15 == 0) {
        System.out.print("FizzBuzz ");
    } else if (i % 3 == 0) {
        System.out.print("Fizz ");
    } else if (i % 5 == 0) {
        System.out.print("Buzz ");
    } else {
        System.out.print(i + " ");
    }
}
// 1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```

### Gotchas

- Without braces only the next statement belongs to the `if`. A second indented line always runs.
- A stray semicolon, `if (x > 0);`, is an empty body. The block after it runs every time.
- `if (count)` does not compile. Write `if (count != 0)` or `if (!list.isEmpty())`.
- An `else` pairs with the nearest `if` that has no `else`, whatever the indentation says. Braces make it unambiguous.
