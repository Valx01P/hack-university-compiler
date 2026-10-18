# For Loops

Java's `for` is the C-style loop: start, condition, step. The enhanced `for (x : items)` walks any array or collection without an index.

### Count up, down, by steps

```java
for (int i = 0; i < 5; i++) {
    System.out.print(i + " "); // 0 1 2 3 4
}

for (int i = 10; i > 0; i -= 3) {
    System.out.print(i + " "); // 10 7 4 1
}

for (int i = 1; i <= 100; i *= 2) {
    System.out.print(i + " "); // 1 2 4 8 16 32 64
}
```

### For-each

```java
import java.util.List;

int[] nums = {3, 1, 4};
for (int n : nums) {
    System.out.print(n + " "); // 3 1 4
}

List<String> names = List.of("Ana", "Bo");
for (String name : names) {
    System.out.println("Hi " + name); // Hi Ana, then Hi Bo
}

for (var name : names) { } // var works too
```

### Two variables at once

```java
for (int i = 0, j = 4; i < j; i++, j--) {
    System.out.println(i + " " + j); // 0 4, then 1 3
}
```

### break, continue, and labels

```java
for (int i = 0; i < 10; i++) {
    if (i == 2) continue; // skip the rest of this pass
    if (i == 5) break;    // leave the loop
    System.out.print(i + " "); // 0 1 3 4
}

outer:
for (int r = 0; r < 3; r++) {
    for (int c = 0; c < 3; c++) {
        if (r * c == 2) break outer; // leaves both loops
        System.out.print(r + "" + c + " "); // 00 01 02 10 11
    }
}
```

### Nested loops

```java
for (int row = 1; row <= 3; row++) {
    StringBuilder line = new StringBuilder();
    for (int col = 1; col <= row; col++) {
        line.append('*');
    }
    System.out.println(line);
}
// *
// **
// ***
```

### Accumulate: sum the evens

```java
int sum = 0;
for (int i = 1; i <= 10; i++) {
    if (i % 2 == 0) {
        sum += i;
    }
}
System.out.println(sum); // 30
```

### Forms at a glance

| Form | Use it for |
| --- | --- |
| `for (int i = 0; i < n; i++)` | count with an index |
| `for (int i = n - 1; i >= 0; i--)` | count down |
| `for (int x : arr)` | each item, no index needed |
| `for (;;)` | loop forever, leave with `break` |
| `break outer;` | exit an outer labeled loop |
| `continue outer;` | skip to the next pass of the outer loop |

### Gotchas

- A variable declared in the header (`int i`) is gone after the loop. Declare it before the loop if you need its final value.
- `i != 10` with a step of `3` never hits `10` and loops forever. Test with `<` or `<=`.
- Assigning to the for-each variable (`n = 0`) does not change the array. Use an index loop to write.
- A stray semicolon, `for (...);`, gives the loop an empty body and runs the block below once.
