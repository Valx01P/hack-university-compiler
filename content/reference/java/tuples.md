# Tuples and Pairs

Java 15 has no tuple type, and records (Java 16) are not available here. For a pair use `Map.entry(a, b)`, for same-type values an array like `int[]{r, c}`, and for anything you keep around write a small class.

### Pair with Map.entry

```java
import java.util.AbstractMap;
import java.util.Map;

Map.Entry<String, Integer> p = Map.entry("Ana", 30); // immutable
System.out.println(p.getKey());   // Ana
System.out.println(p.getValue()); // 30
System.out.println(p);            // Ana=30

Map.Entry<String, Integer> m = new AbstractMap.SimpleEntry<>("Ben", 25);
m.setValue(26);                   // SimpleEntry is mutable
```

### Your own Pair class

Write `equals` and `hashCode` if pairs go into a `HashSet` or are `HashMap` keys.

```java
import java.util.Objects;

class Pair<A, B> {                    // after Main
    final A first;
    final B second;

    Pair(A first, B second) {
        this.first = first;
        this.second = second;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Pair)) return false;
        Pair<?, ?> p = (Pair<?, ?>) o;
        return Objects.equals(first, p.first) && Objects.equals(second, p.second);
    }

    @Override
    public int hashCode() {
        return Objects.hash(first, second);
    }

    @Override
    public String toString() {
        return "(" + first + ", " + second + ")";
    }
}

Pair<String, Integer> q = new Pair<>("Ana", 30);
System.out.println(q.first);                         // Ana
System.out.println(q);                               // (Ana, 30)
System.out.println(q.equals(new Pair<>("Ana", 30))); // true
```

### Return several values

```java
class MinMax {                       // after Main
    final int min, max;
    MinMax(int min, int max) { this.min = min; this.max = max; }
}

static MinMax minMax(int[] a) {      // a method in Main
    int lo = a[0], hi = a[0];
    for (int x : a) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
    }
    return new MinMax(lo, hi);
}

static int[] divmod(int a, int b) {
    return new int[]{a / b, a % b};   // quick and untyped
}

MinMax r = minMax(new int[]{4, 9, 1});
System.out.println(r.min + " " + r.max); // 1 9
int[] qr = divmod(17, 5);
System.out.println(qr[0] + " " + qr[1]); // 3 2
```

### Coordinates in a loop

```java
import java.util.ArrayDeque;
import java.util.Queue;

Queue<int[]> queue = new ArrayDeque<>();
queue.add(new int[]{0, 0});
while (!queue.isEmpty()) {
    int[] cur = queue.poll();
    int row = cur[0], col = cur[1];
    System.out.println(row + " " + col); // 0 0
    // ... queue.add(new int[]{row + 1, col});
}
```

### Pairs as map or set keys

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

Set<List<Integer>> visited = new HashSet<>();
visited.add(List.of(2, 3));
System.out.println(visited.contains(List.of(2, 3))); // true, lists compare by content

Map<String, Integer> dist = new HashMap<>();
dist.put(2 + "," + 3, 5);                            // or a "r,c" string key
```

### Sort a list of pairs

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

List<Map.Entry<String, Integer>> people = new ArrayList<>();
people.add(Map.entry("Cy", 30));
people.add(Map.entry("Ana", 25));
people.add(Map.entry("Ben", 30));
people.sort(Map.Entry.<String, Integer>comparingByValue()
        .thenComparing(Map.Entry.comparingByKey()));   // by age, then name
for (Map.Entry<String, Integer> e : people) {
    System.out.println(e.getKey() + " is " + e.getValue()); // Ana is 25, Ben is 30, Cy is 30
}

List<int[]> pts = new ArrayList<>(List.of(new int[]{3, 1}, new int[]{1, 2}, new int[]{3, 0}));
pts.sort(Comparator.comparingInt((int[] pt) -> pt[0]).thenComparingInt(pt -> pt[1]));
System.out.println(Arrays.deepToString(pts.toArray())); // [[1, 2], [3, 0], [3, 1]]
```

### Which to use

| Option | Use it for |
| --- | --- |
| `Map.entry(a, b)` | a quick immutable pair, no `null`s |
| `new AbstractMap.SimpleEntry<>(a, b)` | a pair you can `setValue` on |
| `int[]{a, b}` | same-type pairs in queues and loops |
| `List.of(a, b)` | a pair you use as a set or map key |
| a small class | anything with names, kept around, or returned |

### Gotchas

- `record Point(int x, int y)` does not compile on Java 15. Write a class.
- An `int[]` as a `HashMap` key or `HashSet` element compares by identity, so lookups with a new array fail. Use `List.of(...)`, a string key, or a class with `equals` and `hashCode`.
- `Map.entry("x", null)` throws `NullPointerException`.
- `Object[] t = {"Ana", 30}` works but needs a cast on every read. Prefer a class.
