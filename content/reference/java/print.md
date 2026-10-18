# Printing

`System.out.println` prints a value and then a newline. `System.out.print` prints without the newline. Both are in `java.lang`, so no import is needed.

### Print a line

```java
System.out.println("Hello, World!");  // Hello, World!
System.out.print("no newline, ");
System.out.print("same line");
System.out.println();                 // ends the line
// no newline, same line
```

### Print any type

```java
System.out.println(42);           // 42
System.out.println(3.0);          // 3.0
System.out.println(1.0 / 3);      // 0.3333333333333333
System.out.println('A');          // A
System.out.println(true);         // true
System.out.println(12_500_000.0); // 1.25E7
```

### Escape sequences

| Escape | Prints |
| --- | --- |
| `\n` | newline |
| `\t` | tab |
| `\"` | double quote inside a string |
| `\'` | single quote inside a `char` |
| `\\` | one backslash |
| `\u0041` | the character with that hex code, here `A` |

```java
System.out.println("Name:\tAda\nRole:\t\"admin\"");
// Name:	Ada
// Role:	"admin"
System.out.println("C:\\Users\\ada");  // C:\Users\ada
```

For several lines of text, a text block (see Strings) reads better than `\n`.

### Use it in a loop

```java
for (int i = 1; i <= 5; i++) {
    System.out.print(i);
    if (i < 5) {
        System.out.print(", ");
    }
}
System.out.println();  // 1, 2, 3, 4, 5
```

### Print arrays and lists

```java
import java.util.Arrays;
import java.util.List;

int[] nums = {3, 1, 2};
System.out.println(nums);                  // [I@1b6d3586, an address, not the contents
System.out.println(Arrays.toString(nums)); // [3, 1, 2]

int[][] grid = {{1, 2}, {3, 4}};
System.out.println(Arrays.deepToString(grid)); // [[1, 2], [3, 4]]

List<String> names = List.of("Ada", "Linus");
System.out.println(names);                 // [Ada, Linus]
```

### Lots of output: build it, print once

Thousands of `println` calls are slow. Collect the text in a `StringBuilder` (in `java.lang`) and print it once.

```java
StringBuilder sb = new StringBuilder();
for (int i = 1; i <= 3; i++) {
    sb.append("line ").append(i).append('\n');
}
System.out.print(sb);
// line 1
// line 2
// line 3
```

### Errors go to stderr

```java
System.err.println("something went wrong");  // stderr, not stdout
```

### Gotchas

- `System.out.println('a' + 'b')` prints `195`, not `ab`. Two `char` values add as numbers.
- Printing an object without a `toString` shows something like `Dog@1b6d3586`. See Classes and Objects.
- Strings take double quotes. Single quotes hold exactly one `char`, so `'hi'` does not compile.
- A `double` of ten million or more, or below `0.001`, prints in scientific notation (`1.25E7`). Use `printf("%.2f%n", x)` for fixed digits.
