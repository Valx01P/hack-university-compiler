# Arrays and ArrayList

An array (`int[]`) has a fixed size set when you create it. An `ArrayList` grows and shrinks, but holds objects only, so you write `List<Integer>`, not `List<int>`.

### Array: create and access

```java
int[] nums = new int[5];          // [0, 0, 0, 0, 0]
int[] primes = {2, 3, 5, 7};
String[] names = new String[3];   // [null, null, null]
boolean[] seen = new boolean[4];  // all false, double[] starts at 0.0

int first = primes[0];                 // 2
int last = primes[primes.length - 1];  // 7 (length is a field, no parentheses)
primes[1] = 13;                        // [2, 13, 5, 7]
```

### Array helpers

```java
import java.util.Arrays;

int[] a = {5, 2, 9, 1};
System.out.println(a);               // [I@1b6d3586, an address, not the contents
Arrays.toString(a);                  // "[5, 2, 9, 1]"
Arrays.sort(a);                      // a is now [1, 2, 5, 9]
Arrays.binarySearch(a, 5);           // 2 (array must be sorted)
int[] bigger = Arrays.copyOf(a, 6);  // [1, 2, 5, 9, 0, 0]
int[] mid = Arrays.copyOfRange(a, 1, 3); // [2, 5], end is exclusive
Arrays.fill(nums, 7);                // [7, 7, 7, 7, 7]
Arrays.equals(a, mid);               // false, compares contents
Arrays.stream(a).sum();              // 17
Arrays.stream(a).max().getAsInt();   // 9
```

### ArrayList: create

```java
import java.util.ArrayList;
import java.util.List;

List<Integer> list = new ArrayList<>();                   // []
List<String> words = new ArrayList<>(List.of("b", "a"));  // ["b", "a"], editable
List<Integer> fixed = List.of(1, 2, 3);                   // immutable
```

### Add, change, remove

```java
list.add(10);                      // [10]
list.add(30);                      // [10, 30]
list.add(1, 20);                   // [10, 20, 30], insert at index 1
list.set(0, 5);                    // [5, 20, 30]
list.remove(0);                    // removes index 0, returns 5
list.remove(Integer.valueOf(30));  // removes the value 30, returns true
list.addAll(List.of(7, 8));        // [20, 7, 8]
list.clear();                      // []
```

### Access and search

```java
List<String> names = new ArrayList<>(List.of("Ana", "Bo", "Cy", "Bo"));
names.get(1);             // "Bo"
names.size();             // 4
names.isEmpty();          // false
names.contains("Cy");     // true
names.indexOf("Bo");      // 1
names.lastIndexOf("Bo");  // 3
names.indexOf("Zed");     // -1
names.subList(1, 3);      // [Bo, Cy], end is exclusive
System.out.println(names); // [Ana, Bo, Cy, Bo], lists print nicely
```

### Sort and reorder

```java
import java.util.Collections;
import java.util.Comparator;

List<Integer> nums = new ArrayList<>(List.of(3, 1, 2));
Collections.sort(nums);                  // [1, 2, 3]
nums.sort(Comparator.reverseOrder());    // [3, 2, 1]
Collections.reverse(nums);               // [1, 2, 3]
Collections.max(nums);                   // 3
Collections.swap(nums, 0, 2);            // [3, 2, 1]
names.sort(Comparator.comparing(String::length)); // shortest first

Integer[] boxed = {3, 1, 2};
Arrays.sort(boxed, Collections.reverseOrder());  // [3, 2, 1], needs Integer[], not int[]
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
