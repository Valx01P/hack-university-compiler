# While Loops

`while` checks its condition before each pass. `do`/`while` checks after, so its body always runs at least once. Reach for them when you don't know the number of passes up front.

### while

```java
int n = 1;
while (n < 100) {
    n *= 3;
}
System.out.println(n); // 243
```

### do / while

```java
int tries = 0;
do {
    tries++;
} while (tries < 3);   // note the semicolon
System.out.println(tries); // 3

int x = 10;
do {
    System.out.println("runs once"); // prints, even though x < 5 is false
} while (x < 5);
```

### while (true) with break

```java
int i = 0;
while (true) {
    i++;
    if (i * i > 50) {
        break;
    }
}
System.out.println(i); // 8
```

### continue

```java
int k = 0;
while (k < 6) {
    k++;                      // update before continue, or it loops forever
    if (k % 2 == 0) continue;
    System.out.print(k + " "); // 1 3 5
}
```

### Digits of a number

```java
int num = 4096;
int digits = 0;
int digitSum = 0;
while (num > 0) {
    digitSum += num % 10; // last digit
    num /= 10;            // drop it
    digits++;
}
System.out.println(digits + " " + digitSum); // 4 19
```

### Read input until it runs out

```stdin
1 2 3
```

```java
import java.util.Scanner;

Scanner in = new Scanner(System.in);
int total = 0;
while (in.hasNextInt()) {
    total += in.nextInt();
}
System.out.println(total); // input "1 2 3" prints 6
```

More reading patterns are in User Input.

### Remove while iterating

```java
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

List<Integer> nums = new ArrayList<>(List.of(1, 2, 3, 4));
Iterator<Integer> it = nums.iterator();
while (it.hasNext()) {
    if (it.next() % 2 == 0) {
        it.remove(); // safe, unlike list.remove inside for-each
    }
}
System.out.println(nums); // [1, 3]
```

### Which loop

| Loop | Use it when |
| --- | --- |
| `for (int i = 0; i < n; i++)` | you know the count |
| `while (cond)` | you loop until something changes |
| `do { } while (cond);` | the body must run at least once (menus, retries) |
| `while (true)` + `break` | the exit test sits in the middle of the body |

### Gotchas

- Forgetting to update the loop variable (or putting `continue` before the update) loops forever.
- `do { } while (cond);` needs the semicolon at the end.
- A variable declared inside the `do` body is not visible in its `while (...)` condition. Declare it before `do`.
- `while (done = true)` compiles for a `boolean` and loops forever. Write `while (!done)`.
