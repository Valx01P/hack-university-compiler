# Strings

`String` is an immutable object: every method returns a new string and leaves the original alone. Compare contents with `.equals()`, never `==`. Single quotes make a `char`, double quotes a `String`.

### Basics

```java
String s = "Hello, World";
System.out.println(s.length());          // 12 (a method, unlike array.length)
System.out.println(s.charAt(0));         // H, a char
System.out.println(s.isEmpty());         // false
System.out.println("   ".isBlank());     // true, only whitespace
System.out.println("ab" + "cd" + 1 + 2); // abcd12, + with any value builds a string
```

### Search

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String s = "Hello, World";
        {{code}}
    }
}
```

```java
System.out.println(s.indexOf('o'));          // 4, first match
System.out.println(s.indexOf("o", 5));       // 8, search from index 5
System.out.println(s.lastIndexOf('o'));      // 8
System.out.println(s.indexOf("xyz"));        // -1, not found
System.out.println(s.contains("World"));     // true
System.out.println(s.startsWith("Hell"));    // true
System.out.println(s.endsWith("!"));         // false
```

### Substrings

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        String s = "Hello, World";
        {{code}}
    }
}
```

```java
System.out.println(s.substring(7));          // World, from 7 to the end
System.out.println(s.substring(0, 5));       // Hello, end index is exclusive
System.out.println(s.substring(s.length() - 3)); // rld, last 3 characters
```

### Compare

```java
System.out.println("apple".equals("apple"));           // true
System.out.println("apple".equalsIgnoreCase("APPLE")); // true
System.out.println("apple".compareTo("banana"));       // -1, negative, apple sorts first
System.out.println("b".compareTo("a"));                // 1
```

### Change (returns a new string)

```java
System.out.println("Hi".toUpperCase());                  // HI
System.out.println("Hi".toLowerCase());                  // hi
System.out.println("  pad  ".strip());                   // pad (trim() also works)
System.out.println("banana".replace('a', 'o'));          // bonono
System.out.println("banana".replace("an", "AN"));        // bANANa, every match
System.out.println("a1b22c".replaceAll("[0-9]+", "#"));  // a#b#c, regex
System.out.println("ab".repeat(3));                      // ababab
```

### Split and join

```java
import java.util.List;

String[] parts = "a,b,c".split(",");
System.out.println(Arrays.toString(parts));                // [a, b, c]
System.out.println(Arrays.toString("one  two three".split("\\s+"))); // [one, two, three]
System.out.println(Arrays.toString("1.5.9".split("\\."))); // [1, 5, 9], escape the dot
System.out.println(String.join("-", parts));               // a-b-c
System.out.println(String.join(", ", List.of("x", "y")));  // x, y
```

### Convert

```java
System.out.println(Integer.parseInt("42"));    // 42, an int
System.out.println(Double.parseDouble("3.5")); // 3.5, a double
System.out.println(String.valueOf(42));        // 42, a String
System.out.println(Integer.toString(7));       // 7, a String
char[] cs = "abc".toCharArray();
System.out.println(Arrays.toString(cs));       // [a, b, c]
System.out.println(new String(cs));            // abc, back to a String
System.out.println(String.valueOf('z'));       // z, char to String
System.out.println("xyz".charAt(0));           // x, String to char
```

### StringBuilder for building in a loop

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 4; i++) {
    sb.append(i).append(',');
}
sb.setLength(sb.length() - 1);     // drop the last comma
sb.insert(0, "[").append("]");
System.out.println(sb.toString()); // [0,1,2,3]
System.out.println(new StringBuilder("abc").reverse().toString()); // cba
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
