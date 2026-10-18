# Errors and Exceptions

Java signals errors by throwing exceptions, which you handle with `try` / `catch`. *Checked* exceptions (like `IOException`) must be caught or declared with `throws`, or the code doesn't compile. *Unchecked* ones (subclasses of `RuntimeException`, like `NullPointerException`) don't have to be.

### try, catch, finally

```java
try {
    int[] a = new int[3];
    a[5] = 1;                                   // throws
    System.out.println("not reached");
} catch (ArrayIndexOutOfBoundsException e) {
    System.out.println("bad index: " + e.getMessage());
    // bad index: Index 5 out of bounds for length 3
} finally {
    System.out.println("always runs");          // even after a return
}
```

### Several catches

Order them from most specific to most general.

```java
String input = "abc";
try {
    int n = Integer.parseInt(input);
    System.out.println(10 / n);
} catch (NumberFormatException e) {
    System.out.println("not a number: " + input);
} catch (ArithmeticException | NullPointerException e) {   // multi-catch
    System.out.println("math or null problem");
} catch (Exception e) {                                     // everything else
    System.out.println("other: " + e);
}
```

### Throw your own

```java
static int divide(int a, int b) {
    if (b == 0) {
        throw new IllegalArgumentException("b must not be 0");
    }
    return a / b;
}

try {
    divide(1, 0);
} catch (IllegalArgumentException e) {
    System.out.println(e.getMessage());   // b must not be 0
}
```

### Checked exceptions and throws

```java
import java.io.IOException;

static void load(String path) throws IOException {   // caller must handle it
    throw new IOException("cannot open " + path);
}

try {
    load("data.txt");
} catch (IOException e) {
    System.out.println(e.getMessage());   // cannot open data.txt
}
```

### Custom exception

Extend `RuntimeException` for unchecked, `Exception` for checked.

```java
class InsufficientFundsException extends RuntimeException {   // after Main
    InsufficientFundsException(String message) {
        super(message);
    }
}

int balance = 50;
try {
    if (balance < 80) throw new InsufficientFundsException("need 30 more");
} catch (InsufficientFundsException e) {
    System.out.println("Error: " + e.getMessage()); // Error: need 30 more
}
```

### Skip bad input in a loop

```java
String[] raw = {"4", "x", "10", "", "-2"};
int sum = 0;
for (String s : raw) {
    try {
        sum += Integer.parseInt(s);
    } catch (NumberFormatException e) {
        System.out.println("skipping \"" + s + "\"");
    }
}
System.out.println(sum);   // 12
```

### try-with-resources

Anything `AutoCloseable` declared in `try (...)` is closed automatically.

```java
import java.io.BufferedReader;
import java.io.StringReader;

try (BufferedReader br = new BufferedReader(new StringReader("line one"))) {
    System.out.println(br.readLine());  // line one
} catch (IOException e) {
    System.out.println("read failed");
}
```

### Wrap and rethrow

```java
try {
    load("cfg.txt");
} catch (IOException e) {
    throw new RuntimeException("setup failed", e);  // keeps the cause
}
```

### Common exceptions

| Exception | Typical cause |
| --- | --- |
| `NullPointerException` | calling a method on `null` |
| `ArrayIndexOutOfBoundsException` | `arr[arr.length]` |
| `IndexOutOfBoundsException` | `list.get(size)` |
| `StringIndexOutOfBoundsException` | `s.charAt(s.length())` |
| `NumberFormatException` | `Integer.parseInt("abc")` |
| `ArithmeticException` | integer `/ 0` or `% 0` |
| `ClassCastException` | `(String) someInteger` |
| `IllegalArgumentException` | a bad argument, thrown on purpose |
| `IllegalStateException` | the object can't do that right now |
| `ConcurrentModificationException` | changing a collection inside its for-each |
| `InputMismatchException` | `Scanner.nextInt()` on non-numbers |

### Exception methods

| Call | Gives |
| --- | --- |
| `e.getMessage()` | the message text |
| `e.toString()` | class name and message |
| `e.getCause()` | the wrapped exception, or `null` |
| `e.printStackTrace()` | full trace on stderr |

### Gotchas

- A broad `catch (Exception e)` before a specific one is a compile error ("has already been caught"). Specific catches come first.
- Calling a method that `throws IOException` without catching or declaring it fails with "unreported exception".
- An empty `catch {}` hides bugs. At least print `e.getMessage()`.
- `catch (Exception e)` also swallows bugs like `NullPointerException`. Catch the specific type you expect.
