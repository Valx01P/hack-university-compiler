# Sorting and Comparators

`Arrays.sort` sorts an array in place, and `list.sort` or `Collections.sort` sorts a list. A primitive array like `int[]` only sorts ascending. For any other order you need objects (`Integer[]`, `int[][]`, a `List`) and a `Comparator`. Sorting objects is stable: items that compare equal keep their earlier order.

### Arrays

```java
import java.util.Arrays;

int[] nums = {5, 2, 9, 1};
Arrays.sort(nums);
System.out.println(Arrays.toString(nums));   // [1, 2, 5, 9]
int[] part = {9, 8, 7, 6, 5};
Arrays.sort(part, 1, 4);                     // only indexes 1 to 3
System.out.println(Arrays.toString(part));   // [9, 6, 7, 8, 5]
String[] words = {"pear", "Apple", "fig"};
Arrays.sort(words);                          // uppercase sorts before lowercase
System.out.println(Arrays.toString(words));  // [Apple, fig, pear]
char[] letters = "listen".toCharArray();
Arrays.sort(letters);
System.out.println(new String(letters));     // eilnst, a key for anagrams
```

### Descending

There is no comparator sort for `int[]`: `Arrays.sort(nums, Collections.reverseOrder())` doesn't compile. Box the values into an `Integer[]` first.

```java
import java.util.Collections;

Integer[] boxed = {5, 2, 9, 1};
Arrays.sort(boxed, Collections.reverseOrder());
System.out.println(Arrays.toString(boxed));  // [9, 5, 2, 1]
int[] nums = {5, 2, 9, 1};
Integer[] copy = Arrays.stream(nums).boxed().toArray(Integer[]::new);
Arrays.sort(copy, (a, b) -> Integer.compare(b, a));
System.out.println(Arrays.toString(copy));   // [9, 5, 2, 1]
```

### Lists

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

List<Integer> list = new ArrayList<>(List.of(3, 1, 2));
Collections.sort(list);
System.out.println(list);                    // [1, 2, 3]
list.sort(Comparator.reverseOrder());        // or Collections.sort(list, Collections.reverseOrder())
System.out.println(list);                    // [3, 2, 1]
list.sort(null);                             // null means natural order
System.out.println(list);                    // [1, 2, 3]
```

### Intervals by start (a 2D array by a column)

Each row of an `int[][]` is an `int[]`, so the comparator gets two rows. Meeting rooms: sort by start, then any meeting that starts before the previous one ends is a clash.

```java
int[][] meetings = {{9, 10}, {1, 3}, {4, 8}, {2, 6}};
Arrays.sort(meetings, (a, b) -> Integer.compare(a[0], b[0]));
System.out.println(Arrays.deepToString(meetings)); // [[1, 3], [2, 6], [4, 8], [9, 10]]
boolean canAttendAll = true;
for (int i = 1; i < meetings.length; i++) {
    if (meetings[i][0] < meetings[i - 1][1]) {
        canAttendAll = false;
    }
}
System.out.println(canAttendAll);                  // false, [2, 6] starts inside [1, 3]
int[][] byEnd = {{1, 9}, {2, 3}, {4, 5}};
Arrays.sort(byEnd, Comparator.comparingInt(a -> a[1])); // by the second column
System.out.println(Arrays.deepToString(byEnd));    // [[2, 3], [4, 5], [1, 9]]
```

### Merge intervals

```java
int[][] intervals = {{8, 10}, {1, 3}, {2, 6}, {15, 18}};
Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
List<int[]> merged = new ArrayList<>();
for (int[] cur : intervals) {
    if (merged.isEmpty() || merged.get(merged.size() - 1)[1] < cur[0]) {
        merged.add(cur);                         // no overlap, start a new one
    } else {
        int[] last = merged.get(merged.size() - 1);
        last[1] = Math.max(last[1], cur[1]);     // overlap, stretch the last one
    }
}
int[][] result = merged.toArray(new int[0][]);
System.out.println(Arrays.deepToString(result)); // [[1, 6], [8, 10], [15, 18]]
```

### By two columns

```java
int[][] pairs = {{2, 5}, {1, 9}, {2, 1}, {1, 3}};
Arrays.sort(pairs, (a, b) -> a[0] != b[0]
        ? Integer.compare(a[0], b[0])           // first column ascending
        : Integer.compare(b[1], a[1]));         // ties: second column descending
System.out.println(Arrays.deepToString(pairs)); // [[1, 9], [1, 3], [2, 5], [2, 1]]
Arrays.sort(pairs, Comparator.comparingInt((int[] a) -> a[0]).thenComparingInt(a -> a[1]));
System.out.println(Arrays.deepToString(pairs)); // [[1, 3], [1, 9], [2, 1], [2, 5]]
```

### Comparator.comparing, thenComparing, reversed

```java
class Person {
    String name;
    int age;
    Person(String name, int age) { this.name = name; this.age = age; }
    String getName() { return name; }
    int getAge() { return age; }
    public String toString() { return name + " " + age; }
}
List<Person> people = new ArrayList<>(List.of(
        new Person("Cy", 30), new Person("Ana", 25), new Person("Ben", 30)));
people.sort(Comparator.comparing(Person::getName));
System.out.println(people); // [Ana 25, Ben 30, Cy 30]
people.sort(Comparator.comparingInt(Person::getAge).reversed().thenComparing(Person::getName));
System.out.println(people); // [Ben 30, Cy 30, Ana 25], reversed() flips the chain before it
people.sort(Comparator.comparing(Person::getName, Comparator.reverseOrder()));
System.out.println(people); // [Cy 30, Ben 30, Ana 25], flips only this key
List<String> words = new ArrayList<>(List.of("kiwi", "fig", "apple", "date"));
words.sort(Comparator.comparingInt(String::length));
System.out.println(words);  // [fig, kiwi, date, apple], stable: kiwi stays before date
words.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));
System.out.println(words);  // [fig, date, kiwi, apple]
```

### A custom order (largest number)

```java
int[] nums = {3, 30, 34, 5, 9};
String[] parts = new String[nums.length];
for (int i = 0; i < nums.length; i++) {
    parts[i] = String.valueOf(nums[i]);
}
Arrays.sort(parts, (x, y) -> (y + x).compareTo(x + y)); // "9" + "5" beats "5" + "9"
String joined = String.join("", parts);
System.out.println(joined.startsWith("0") ? "0" : joined); // 9534330
```

### A map's entries by value

```java
import java.util.Map;
import java.util.TreeMap;

Map<String, Integer> counts = new TreeMap<>(Map.of("the", 3, "a", 3, "cat", 1, "sat", 2));
List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
Comparator<Map.Entry<String, Integer>> byCount = (x, y) -> {
    if (!x.getValue().equals(y.getValue())) {
        return Integer.compare(y.getValue(), x.getValue()); // count, high first
    }
    return x.getKey().compareTo(y.getKey());                // then word, A to Z
};
entries.sort(byCount);
System.out.println(entries); // [a=3, the=3, sat=2, cat=1]
entries.sort(Map.Entry.<String, Integer>comparingByValue().reversed()
        .thenComparing(Map.Entry.comparingByKey()));        // the same order
System.out.println(entries); // [a=3, the=3, sat=2, cat=1]
```

### Merge sort (divide and conquer)

Sort each half, then merge the two sorted halves with two pointers.

```java
static void mergeSort(int[] a, int lo, int hi) {     // sorts a[lo] up to a[hi - 1]
    if (hi - lo < 2) {
        return;
    }
    int mid = (lo + hi) / 2;
    mergeSort(a, lo, mid);
    mergeSort(a, mid, hi);
    int[] merged = new int[hi - lo];
    int i = lo, j = mid, k = 0;
    while (k < merged.length) {
        if (j == hi || (i < mid && a[i] <= a[j])) {  // <= keeps equal values in order
            merged[k++] = a[i++];
        } else {
            merged[k++] = a[j++];
        }
    }
    System.arraycopy(merged, 0, a, lo, merged.length);
}

int[] a = {5, 2, 9, 1, 7};
mergeSort(a, 0, a.length);
System.out.println(Arrays.toString(a)); // [1, 2, 5, 7, 9]
```

### Sweep line: rooms in use at once

Meeting rooms II: sort the starts and the ends on their own. Walk the starts, and a start before the earliest end still running needs a new room.

```java
int[][] meetings = {{0, 30}, {5, 10}, {15, 20}, {10, 15}};
int[] starts = new int[meetings.length];
int[] ends = new int[meetings.length];
for (int i = 0; i < meetings.length; i++) {
    starts[i] = meetings[i][0];
    ends[i] = meetings[i][1];
}
Arrays.sort(starts);
Arrays.sort(ends);
int rooms = 0;
int e = 0;
for (int s : starts) {
    if (s < ends[e]) {
        rooms++;             // nothing has ended yet: open a room
    } else {
        e++;                 // a meeting ended: take its room
    }
}
System.out.println(rooms);  // 2
```

### Calls

| Call | Does |
| --- | --- |
| `Arrays.sort(a)` | ascending, O(n log n) |
| `Arrays.sort(a, from, to)` | only indexes `from` up to `to`, exclusive |
| `Arrays.sort(a, cmp)` | objects only: `Integer[]`, `String[]`, `int[][]` |
| `list.sort(cmp)` | sort a list, `null` for natural order |
| `Collections.reverseOrder()` | the descending comparator |
| `Comparator.comparingInt(f)` | by an `int` key |
| `Comparator.comparing(f)` | by any comparable key |
| `.thenComparing(f)` | break ties with another key |
| `.reversed()` | flip the chain so far |
| `Map.Entry.comparingByValue()` | entries by value, also `comparingByKey()` |

### The a - b trap

```java
Integer[] vals = {5, Integer.MIN_VALUE, -3};
Arrays.sort(vals, (a, b) -> a - b);          // 5 - MIN_VALUE overflows
System.out.println(Arrays.toString(vals));   // [5, -2147483648, -3], wrong
Arrays.sort(vals, (a, b) -> Integer.compare(a, b));
System.out.println(Arrays.toString(vals));   // [-2147483648, -3, 5]
```

### Gotchas

- Write `Integer.compare(a, b)` (or `Long.compare`), never `a - b`, which overflows when the values are far apart.
- `Comparator.comparing(s -> s.length()).reversed()` doesn't compile: chaining stops Java from inferring the lambda's type. Use `String::length` or `(String s) -> s.length()`.
- `x.getValue() != y.getValue()` on two `Integer` values compares objects, which breaks above 127. Use `equals` or `Integer.compare`.
