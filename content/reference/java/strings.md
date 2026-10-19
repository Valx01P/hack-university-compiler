# Strings

`String` is an immutable object: every method returns a new string and leaves the original alone. Compare contents with `.equals()`, never `==`. Single quotes make a `char`, double quotes a `String`.

### Basics

```java
String s = "Hello, World";
s.length();          // 12 (a method, unlike array.length)
s.charAt(0);         // 'H', a char
s.isEmpty();         // false
"   ".isBlank();     // true, only whitespace
String both = "ab" + "cd" + 1 + 2;  // "abcd12", + with any value builds a string
```

### Search

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String s = "Hello, World";
        {{code}}
        System.out.println(s);
    }
}
```

```java
s.indexOf('o');          // 4, first match
s.indexOf("o", 5);       // 8, search from index 5
s.lastIndexOf('o');      // 8
s.indexOf("xyz");        // -1, not found
s.contains("World");     // true
s.startsWith("Hell");    // true
s.endsWith("!");         // false
```

### Substrings

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String s = "Hello, World";
        {{code}}
        System.out.println(s);
    }
}
```

```java
s.substring(7);          // "World", from 7 to the end
s.substring(0, 5);       // "Hello", end index is exclusive
s.substring(s.length() - 3); // "rld", last 3 characters
```

### Compare

```java
"apple".equals("apple");             // true
"apple".equalsIgnoreCase("APPLE");   // true
"apple".compareTo("banana");         // negative, apple sorts first
"b".compareTo("a");                  // 1
```

### Change (returns a new string)

```java
"Hi".toUpperCase();                  // "HI"
"Hi".toLowerCase();                  // "hi"
"  pad  ".strip();                   // "pad" (trim() also works)
"banana".replace('a', 'o');          // "bonono"
"banana".replace("an", "AN");        // "bANANa", every match
"a1b22c".replaceAll("[0-9]+", "#");  // "a#b#c", regex
"ab".repeat(3);                      // "ababab"
```

### Split and join

```java
import java.util.List;

String[] parts = "a,b,c".split(",");       // ["a", "b", "c"]
String[] words = "one  two three".split("\\s+"); // ["one", "two", "three"]
String[] nums = "1.5.9".split("\\.");      // ["1", "5", "9"], escape the dot
String joined = String.join("-", parts);   // "a-b-c"
String fromList = String.join(", ", List.of("x", "y")); // "x, y"
```

### Convert

```java
int n = Integer.parseInt("42");            // 42
double d = Double.parseDouble("3.5");      // 3.5
String t = String.valueOf(42);             // "42"
String u = Integer.toString(7);            // "7"
char[] cs = "abc".toCharArray();           // ['a', 'b', 'c']
String back = new String(cs);              // "abc"
String one = String.valueOf('z');          // "z", char to String
char first = "xyz".charAt(0);              // 'x', String to char
```

### StringBuilder for building in a loop

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 4; i++) {
    sb.append(i).append(',');
}
sb.setLength(sb.length() - 1);   // drop the last comma
sb.insert(0, "[").append("]");
String out = sb.toString();      // "[0,1,2,3]"
new StringBuilder("abc").reverse().toString(); // "cba"
```

### Text blocks

A text block (Java 15) is a multi-line string. The common indentation is removed, and the closing `"""` on its own line adds a final newline.

```java
String poem = """
    roses are red
      violets are blue
    """;
System.out.print(poem);
// roses are red
//   violets are blue
```

For `String.format`, `formatted`, and `%` specifiers, see Printing Variables.

### Methods you'll use

| Call | Does |
| --- | --- |
| `s.length()` | number of chars |
| `s.charAt(i)` | char at index `i` |
| `s.substring(a, b)` | chars `a` up to (not including) `b` |
| `s.indexOf(x)` | first index of `x`, or `-1` |
| `s.contains(x)` | `true` if `x` appears |
| `s.equals(t)` | same contents |
| `s.split(regex)` | `String[]` of pieces |
| `s.strip()` / `s.trim()` | remove outer whitespace |
| `s.toUpperCase()` | uppercase copy |
| `s.replace(a, b)` | replace every `a` with `b` |
| `String.join(sep, items)` | glue items with `sep` |
| `String.valueOf(x)` | any value to a `String` |

### Gotchas

- `a == b` checks whether they are the same object, so it can be `false` for equal text. Use `a.equals(b)`.
- `s.toUpperCase()` alone does nothing useful. Strings never change, so write `s = s.toUpperCase()`.
- `split` and `replaceAll` take a regex, where `.` matches any character: `"1.5".split(".")` is an empty array. Escape it as `"\\."`, or use `replace` for plain text.
