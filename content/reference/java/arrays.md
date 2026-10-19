# Arrays and ArrayList

An array (`int[]`) has a fixed size set when you create it. An `ArrayList` grows and shrinks, but holds objects only, so you write `List<Integer>`, not `List<int>`.

### Array: create and access

```java
int[] nums = new int[5];
System.out.println(Arrays.toString(nums));   // [0, 0, 0, 0, 0]
int[] primes = {2, 3, 5, 7};
String[] names = new String[3];
System.out.println(Arrays.toString(names));  // [null, null, null]
boolean[] seen = new boolean[4];             // all false, double[] starts at 0.0

System.out.println(primes[0]);                  // 2
System.out.println(primes[primes.length - 1]);  // 7 (length is a field, no parentheses)
primes[1] = 13;
System.out.println(Arrays.toString(primes));    // [2, 13, 5, 7]
```

### Array helpers

```java
import java.util.Arrays;

int[] a = {5, 2, 9, 1};
int[] nums = new int[5];
System.out.println(a);                                  // an address, not the contents
System.out.println(Arrays.toString(a));                 // [5, 2, 9, 1]
Arrays.sort(a);
System.out.println(Arrays.toString(a));                 // [1, 2, 5, 9]
System.out.println(Arrays.binarySearch(a, 5));          // 2 (array must be sorted)
int[] bigger = Arrays.copyOf(a, 6);
System.out.println(Arrays.toString(bigger));            // [1, 2, 5, 9, 0, 0]
int[] mid = Arrays.copyOfRange(a, 1, 3);
System.out.println(Arrays.toString(mid));               // [2, 5], end is exclusive
Arrays.fill(nums, 7);
System.out.println(Arrays.toString(nums));              // [7, 7, 7, 7, 7]
System.out.println(Arrays.equals(a, mid));              // false, compares contents
System.out.println(Arrays.stream(a).sum());             // 17
System.out.println(Arrays.stream(a).max().getAsInt());  // 9
```

### ArrayList: create

```java
import java.util.ArrayList;
import java.util.List;

List<Integer> list = new ArrayList<>();
System.out.println(list);                                 // []
List<String> words = new ArrayList<>(List.of("b", "a"));
System.out.println(words);                                // [b, a], editable
List<Integer> fixed = List.of(1, 2, 3);                   // immutable
```

### Add, change, remove

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        List<Integer> list = new ArrayList<>();
        {{code}}
    }
}
```

```java
list.add(10);
list.add(30);
System.out.println(list);                              // [10, 30]
list.add(1, 20);                                       // insert at index 1
System.out.println(list);                              // [10, 20, 30]
list.set(0, 5);
System.out.println(list);                              // [5, 20, 30]
System.out.println(list.remove(0));                    // 5, removes index 0
System.out.println(list.remove(Integer.valueOf(30)));  // true, removes the value 30
list.addAll(List.of(7, 8));
System.out.println(list);                              // [20, 7, 8]
list.clear();
System.out.println(list);                              // []
```

### Access and search

```java
List<String> names = new ArrayList<>(List.of("Ana", "Bo", "Cy", "Bo"));
System.out.println(names.get(1));             // Bo
System.out.println(names.size());             // 4
System.out.println(names.isEmpty());          // false
System.out.println(names.contains("Cy"));     // true
System.out.println(names.indexOf("Bo"));      // 1
System.out.println(names.lastIndexOf("Bo"));  // 3
System.out.println(names.indexOf("Zed"));     // -1
System.out.println(names.subList(1, 3));      // [Bo, Cy], end is exclusive
System.out.println(names);                    // [Ana, Bo, Cy, Bo], lists print nicely
```

### Sort and reorder

```java
import java.util.Collections;
import java.util.Comparator;

List<Integer> nums = new ArrayList<>(List.of(3, 1, 2));
List<String> names = new ArrayList<>(List.of("Ana", "Bo", "Cy", "Bo"));
Collections.sort(nums);
System.out.println(nums);                   // [1, 2, 3]
nums.sort(Comparator.reverseOrder());
System.out.println(nums);                   // [3, 2, 1]
Collections.reverse(nums);
System.out.println(nums);                   // [1, 2, 3]
System.out.println(Collections.max(nums));  // 3
Collections.swap(nums, 0, 2);
System.out.println(nums);                   // [3, 2, 1]
names.sort(Comparator.comparing(String::length)); // shortest first

Integer[] boxed = {3, 1, 2};
Arrays.sort(boxed, Collections.reverseOrder());  // needs Integer[], not int[]
System.out.println(Arrays.toString(boxed));      // [3, 2, 1]
```

### Convert

```java
import java.util.stream.Collectors;

int[] arr = {1, 2, 3};
List<Integer> asList = Arrays.stream(arr).boxed().collect(Collectors.toList());
int[] back = asList.stream().mapToInt(Integer::intValue).toArray();

String[] parts = {"x", "y"};
List<String> partList = new ArrayList<>(Arrays.asList(parts));
String[] again = partList.toArray(new String[0]);
System.out.println(asList + " " + partList);  // [1, 2, 3] [x, y]
```

### Use it in a loop

```java
List<Integer> squares = new ArrayList<>();
for (int i = 1; i <= 5; i++) {
    squares.add(i * i);
}
System.out.println(squares); // [1, 4, 9, 16, 25]
```

### Array vs ArrayList

| Task | `int[] a` | `List<Integer> l` |
| --- | --- | --- |
| size | `a.length` | `l.size()` |
| read | `a[i]` | `l.get(i)` |
| write | `a[i] = x` | `l.set(i, x)` |
| append | not possible | `l.add(x)` |
| print | `Arrays.toString(a)` | `System.out.println(l)` |
| sort | `Arrays.sort(a)` | `Collections.sort(l)` |

### Gotchas

- Size is `arr.length`, `str.length()`, and `list.size()`. Three spellings for one idea.
- `List<int>` does not compile. Use the wrapper type `Integer` (also `Double`, `Character`, `Boolean`).
- On a `List<Integer>`, `remove(1)` removes index 1. Use `remove(Integer.valueOf(1))` to remove the value 1.
- `List.of(...)` and `Arrays.asList(...)` can't grow, and `add` throws `UnsupportedOperationException`. Wrap them in `new ArrayList<>(...)`.
