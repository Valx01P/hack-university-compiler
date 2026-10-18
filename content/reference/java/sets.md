# Sets

`Set<E>` holds each value once. Pick `HashSet` (fastest, no order), `LinkedHashSet` (insertion order), or `TreeSet` (sorted). `contains` on a `HashSet` is O(1), which is why sets beat lists for "have I seen this?".

### Create

```java
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

Set<String> words = new HashSet<>();
Set<String> ordered = new LinkedHashSet<>();               // keeps insertion order
Set<Integer> sorted = new TreeSet<>();                     // keeps values sorted
Set<Integer> fixed = Set.of(1, 2, 3);                      // immutable
Set<Integer> fromList = new HashSet<>(List.of(3, 1, 3, 2)); // [1, 2, 3], one 3 dropped
```

### Add, remove, check

```java
Set<String> tags = new TreeSet<>();
tags.add("java");        // true, it was added
tags.add("java");        // false, already there
tags.add("go");
tags.contains("go");     // true
tags.remove("go");       // true
tags.size();             // 1
System.out.println(tags); // [java]
```

### Union, intersection, difference

These change the set they are called on, so copy first.

```java
Set<Integer> a = new TreeSet<>(List.of(1, 2, 3, 4));
Set<Integer> b = new TreeSet<>(List.of(3, 4, 5));

Set<Integer> union = new TreeSet<>(a);
union.addAll(b);         // [1, 2, 3, 4, 5]
Set<Integer> both = new TreeSet<>(a);
both.retainAll(b);       // [3, 4]
Set<Integer> onlyA = new TreeSet<>(a);
onlyA.removeAll(b);      // [1, 2]

a.containsAll(both);     // true, subset check
```

### Seen-before in a loop

```java
int[] nums = {4, 7, 1, 7, 4};
Set<Integer> seen = new HashSet<>();
for (int n : nums) {
    if (!seen.add(n)) {  // add returns false on a repeat
        System.out.println("first repeat: " + n); // first repeat: 7
        break;
    }
}
```

### Remove duplicates from a list

```java
import java.util.ArrayList;

List<String> names = List.of("bo", "al", "bo", "cy", "al");
List<String> unique = new ArrayList<>(new LinkedHashSet<>(names)); // [bo, al, cy]
Set<String> abc = new TreeSet<>(names);                            // [al, bo, cy]
for (String n : abc) {
    System.out.print(n + " ");  // al bo cy
}
```

### TreeSet lookups

```java
TreeSet<Integer> t = new TreeSet<>(List.of(10, 20, 30, 40));
t.first();         // 10
t.last();          // 40
t.floor(25);       // 20, largest <= 25
t.ceiling(25);     // 30, smallest >= 25
t.lower(10);       // null, nothing < 10
t.higher(30);      // 40
t.headSet(30);     // [10, 20], values < 30
t.tailSet(30);     // [30, 40], values >= 30
t.descendingSet(); // [40, 30, 20, 10]
t.pollFirst();     // 10, and removes it
```

### Common calls

| Call | Does |
| --- | --- |
| `add(x)` | adds, returns `false` if already present |
| `remove(x)` | removes, returns `true` if it was there |
| `contains(x)` | membership test |
| `addAll(c)` | union, in place |
| `retainAll(c)` | intersection, in place |
| `removeAll(c)` | difference, in place |
| `containsAll(c)` | subset test |
| `Collections.disjoint(a, b)` | `true` if no common values |

### Gotchas

- `HashSet` prints in hash order, not the order you added. Use `TreeSet` or `LinkedHashSet` for predictable output.
- `Set.of(...)` is immutable, and `Set.of(1, 1)` throws `IllegalArgumentException` for the duplicate.
- Arrays compare by identity: a `Set<int[]>` never finds a new `int[]{1, 2}`. Use `List.of(1, 2)` as the element instead.
- Your own classes need `equals` and `hashCode` (see Classes and Objects) or a `HashSet` keeps "duplicates".
