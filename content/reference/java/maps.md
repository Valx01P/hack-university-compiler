# Maps

`Map<K, V>` is the interface, and you pick an implementation: `HashMap` (fast, no order), `LinkedHashMap` (insertion order), or `TreeMap` (keys sorted). Keys and values are objects, so write `Map<String, Integer>`, never `Map<String, int>`.

### Create

```java
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

Map<String, Integer> ages = new HashMap<>();
Map<String, Integer> ordered = new LinkedHashMap<>(); // keeps insertion order
Map<String, Integer> sorted = new TreeMap<>();        // keeps keys sorted
Map<String, Integer> fixed = Map.of("a", 1, "b", 2);  // immutable, up to 10 pairs
Map<String, Integer> copy = new HashMap<>(fixed);     // mutable copy
```

### Add, update, remove

```java
ages.put("Ana", 30);           // insert or overwrite
ages.put("Ben", 25);
ages.putIfAbsent("Ana", 99);   // does nothing, Ana exists (returns 30)
ages.remove("Ben");            // returns 25
ages.replace("Ana", 31);       // only if the key exists
System.out.println(ages);      // {Ana=31}
```

### Access

```java
ages.get("Ana");               // 31
ages.get("Zed");               // null, the key is missing
ages.getOrDefault("Zed", 0);   // 0
ages.containsKey("Ana");       // true
ages.containsValue(31);        // true
ages.size();                   // 1
ages.isEmpty();                // false
```

### Count things

```java
String[] words = {"a", "b", "a", "c", "a"};
Map<String, Integer> counts = new TreeMap<>();
for (String w : words) {
    counts.put(w, counts.getOrDefault(w, 0) + 1);
    // same thing: counts.merge(w, 1, Integer::sum);
}
System.out.println(counts);    // {a=3, b=1, c=1}
```

### Group into lists

```java
import java.util.ArrayList;
import java.util.List;

Map<Integer, List<String>> byLength = new TreeMap<>();
for (String s : List.of("hi", "yo", "hey")) {
    byLength.computeIfAbsent(s.length(), k -> new ArrayList<>()).add(s);
}
System.out.println(byLength);  // {2=[hi, yo], 3=[hey]}
```

### Loop

```java
Map<String, Integer> scores = new TreeMap<>(Map.of("Ana", 90, "Ben", 85, "Cy", 72));

for (Map.Entry<String, Integer> e : scores.entrySet()) {
    System.out.println(e.getKey() + ": " + e.getValue()); // Ana: 90, Ben: 85, Cy: 72
}
for (String name : scores.keySet()) { /* keys only */ }
for (int s : scores.values()) { /* values only */ }
scores.forEach((k, v) -> System.out.println(k + "=" + v));

scores.entrySet().removeIf(e -> e.getValue() < 80); // safe removal
System.out.println(scores);    // {Ana=90, Ben=85}
```

### Sort by value

```java
List<Map.Entry<String, Integer>> entries = new ArrayList<>(scores.entrySet());
entries.sort(Map.Entry.comparingByValue());                            // [Ben=85, Ana=90]
entries.sort(Map.Entry.<String, Integer>comparingByValue().reversed()); // [Ana=90, Ben=85]
```

### TreeMap lookups

```java
TreeMap<Integer, String> t = new TreeMap<>(Map.of(1, "a", 5, "e", 9, "i"));
t.firstKey();     // 1
t.lastKey();      // 9
t.floorKey(6);    // 5, largest key <= 6 (null if none)
t.ceilingKey(6);  // 9, smallest key >= 6
t.headMap(5);     // {1=a}, keys < 5
t.tailMap(5);     // {5=e, 9=i}, keys >= 5
```

### Common calls

| Call | Does |
| --- | --- |
| `put(k, v)` | insert or overwrite, returns the old value or `null` |
| `get(k)` | value, or `null` if missing |
| `getOrDefault(k, d)` | value, or `d` if missing |
| `containsKey(k)` | is the key there |
| `remove(k)` | delete, returns the old value |
| `merge(k, 1, Integer::sum)` | add 1, starting from 1 |
| `computeIfAbsent(k, f)` | create the value on first use, return it |
| `keySet()` `values()` `entrySet()` | views to loop over |

### Gotchas

- `int n = map.get("missing");` throws `NullPointerException`, because `null` can't unbox to `int`. Use `getOrDefault`.
- `HashMap` order is not insertion order. Use `LinkedHashMap` or `TreeMap` when the printed order matters.
- `Map.of(...)` is immutable: `put` throws `UnsupportedOperationException`. Wrap it in `new HashMap<>(...)` to edit.
- Calling `map.remove` inside a for-each over the map throws `ConcurrentModificationException`. Use `entrySet().removeIf(...)`.
