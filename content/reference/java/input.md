# User Input

Read standard input with `Scanner` (easy) or `BufferedReader` (faster for big inputs). Make one reader at the start of `main` and reuse it. The examples show the input they expect in a comment.

### Scanner basics

```stdin
Ana 30 1.75
hello big world
```

```java
import java.util.Scanner;

Scanner sc = new Scanner(System.in);
// input: Ana 30 1.75
String name = sc.next();        // "Ana", one word
int age = sc.nextInt();         // 30
double height = sc.nextDouble(); // 1.75
sc.nextLine();                  // drop the rest of that line
// input: hello big world
String line = sc.nextLine();    // "hello big world", the whole line
```

| Call | Reads |
| --- | --- |
| `next()` | the next word (up to whitespace) |
| `nextInt()` `nextLong()` `nextDouble()` | the next number |
| `nextLine()` | the rest of the current line |
| `hasNextInt()` `hasNextLine()` `hasNext()` | is there more of that kind |
| `Integer.parseInt(s)` | `"42"` to `42` |

### Numbers into an array

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        Scanner sc = new Scanner(System.in);
        {{code}}
    }
}
```

```stdin
5
3 9 1 7 4
```

```java
// input:
// 5
// 3 9 1 7 4
int n = sc.nextInt();
int[] nums = new int[n];
for (int i = 0; i < n; i++) {
    nums[i] = sc.nextInt();     // spaces and newlines both separate numbers
}
int max = nums[0];
for (int x : nums) max = Math.max(max, x);
System.out.println(max);        // 9
```

### Read until the input ends

```stdin
4 8 15 16 23 42
```

```java
import java.util.ArrayList;
import java.util.List;

Scanner sc = new Scanner(System.in);
// input: 4 8 15 16 23 42
List<Integer> values = new ArrayList<>();
while (sc.hasNextInt()) {
    values.add(sc.nextInt());
}
System.out.println(values.size()); // 6
```

### A line into words, a map, and a set

```stdin
the cat and the hat
```

```java
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

Scanner sc = new Scanner(System.in);
// input: the cat and the hat
String[] words = sc.nextLine().trim().split("\\s+");
Map<String, Integer> counts = new TreeMap<>();
Set<String> unique = new TreeSet<>();
for (String w : words) {
    counts.merge(w, 1, Integer::sum);
    unique.add(w);
}
System.out.println(counts);     // {and=1, cat=1, hat=1, the=2}
System.out.println(unique);     // [and, cat, hat, the]
```

### Lines into objects

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        Scanner sc = new Scanner(System.in);
        {{code}}
    }
}
```

```stdin
2
Ana 90
Ben 85
```

```java
class Student {                  // after Main
    String name;
    int score;
    Student(String name, int score) { this.name = name; this.score = score; }
}

// input:
// 2
// Ana 90
// Ben 85
int count = Integer.parseInt(sc.nextLine().trim());
List<Student> students = new ArrayList<>();
for (int i = 0; i < count; i++) {
    String[] parts = sc.nextLine().trim().split("\\s+");
    students.add(new Student(parts[0], Integer.parseInt(parts[1])));
}
for (Student s : students) {
    System.out.println(s.name + ": " + s.score); // Ana: 90, Ben: 85
}
```

### BufferedReader (fast)

`readLine()` returns `null` at the end of input. It throws `IOException`, so declare it on `main`.

```stdin
1 2
3 4
```

```java
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line;
        int total = 0;
        while ((line = br.readLine()) != null) {   // input: 1 2 and then 3 4
            for (String part : line.trim().split("\\s+")) {
                if (!part.isEmpty()) total += Integer.parseInt(part);
            }
        }
        System.out.println(total);  // 10
    }
}
```

### Gotchas

- `nextInt()` leaves the newline behind, so the next `nextLine()` returns `""`. Call `sc.nextLine()` once to skip it, or read every line with `nextLine()` and parse.
- `nextInt()` on text like `"abc"` throws `InputMismatchException`, and on no more input `NoSuchElementException`. Check with `hasNextInt()` first.
- `Integer.parseInt(" 42")` throws `NumberFormatException` because of the space. `trim()` first.
- `split(" ")` on `"a  b"` gives an empty string in the middle. Split on `"\\s+"` after `trim()`.
