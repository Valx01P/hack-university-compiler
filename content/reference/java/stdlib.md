# Standard Library

Most of what you need is in `java.util`. Only `java.lang` (`String`, `Math`, `Integer`, `System`) is imported for you, so everything else needs an `import` line.

| Import | For |
| --- | --- |
| `java.util.ArrayList`, `List`, `HashMap`, `Map`, `HashSet`, `Set` | collections |
| `java.util.ArrayDeque`, `Deque`, `Queue`, `PriorityQueue` | stacks, queues, heaps |
| `java.util.Arrays`, `Collections` | sort, search, fill (see Arrays and ArrayList) |
| `java.util.Random`, `Scanner`, `Optional`, `Objects` | random numbers, input, null helpers |
| `java.util.stream.Collectors`, `IntStream` | streams |
| `java.math.BigInteger`, `BigDecimal` | numbers beyond `long`, exact decimals |
| `java.time.LocalDate` | dates |

### Stack and queue: ArrayDeque

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Queue;

Deque<Integer> stack = new ArrayDeque<>();
stack.push(1);
stack.push(2);
stack.push(3);
stack.peek();            // 3, top without removing
stack.pop();             // 3
System.out.println(stack); // [2, 1]

Queue<String> queue = new ArrayDeque<>();
queue.offer("a");        // add at the back
queue.offer("b");
queue.peek();            // "a"
queue.poll();            // "a", removes from the front
queue.poll();            // "b"
queue.poll();            // null, empty
```

| Deque call | Does |
| --- | --- |
| `offerFirst(x)` / `offerLast(x)` | add at the front or back |
| `pollFirst()` / `pollLast()` | remove from the front or back, `null` if empty |
| `peekFirst()` / `peekLast()` | look without removing |

### Heap: PriorityQueue

```java
import java.util.Collections;
import java.util.PriorityQueue;

Queue<Integer> minHeap = new PriorityQueue<>();
Queue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
for (int x : new int[] {5, 1, 4}) {
    minHeap.offer(x);
    maxHeap.offer(x);
}
minHeap.poll();          // 1
maxHeap.poll();          // 5
while (!minHeap.isEmpty()) {
    System.out.print(minHeap.poll() + " "); // 4 5
}

// int[] entries, smallest second value first
Queue<int[]> byDist = new PriorityQueue<>((a, b) -> Integer.compare(a[1], b[1]));
```

### Random

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

Random rng = new Random();      // new Random(42) gives the same numbers every run
int die = rng.nextInt(6) + 1;   // 1 to 6
double x = rng.nextDouble();    // 0.0 up to, not including, 1.0
boolean coin = rng.nextBoolean();
List<Integer> deck = new ArrayList<>(List.of(1, 2, 3, 4));
Collections.shuffle(deck, rng); // random order, in place
```

### Streams

```java
import java.util.stream.Collectors;
import java.util.stream.IntStream;

List<String> words = List.of("apple", "fig", "banana", "kiwi");
List<String> longOnes = words.stream()
        .filter(w -> w.length() > 3)
        .map(String::toUpperCase)
        .collect(Collectors.toList());               // [APPLE, BANANA, KIWI]
int letters = words.stream().mapToInt(String::length).sum();      // 18
String joined = words.stream().sorted().collect(Collectors.joining(", "));
// apple, banana, fig, kiwi
boolean anyB = words.stream().anyMatch(w -> w.startsWith("b"));   // true
int sum = IntStream.rangeClosed(1, 5).sum();                      // 15
```

### Optional

```java
import java.util.Optional;

Optional<String> firstB = words.stream().filter(w -> w.startsWith("b")).findFirst();
firstB.isPresent();       // true
firstB.get();             // "banana"
words.stream().filter(w -> w.startsWith("z")).findFirst().orElse("none"); // "none"
firstB.ifPresent(w -> System.out.println("found " + w));                 // found banana
```

### Big numbers

```java
import java.math.BigDecimal;
import java.math.BigInteger;

BigInteger f = BigInteger.ONE;
for (int i = 2; i <= 25; i++) {
    f = f.multiply(BigInteger.valueOf(i));  // immutable: reassign the result
}
System.out.println(f);                      // 15511210043330985984000000
new BigDecimal("0.1").add(new BigDecimal("0.2")); // 0.3, while 0.1 + 0.2 is 0.30000000000000004
```

### Dates

```java
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

LocalDate d = LocalDate.of(2024, 2, 28);
d.plusDays(1);                     // 2024-02-29
d.getDayOfWeek();                  // WEDNESDAY
d.isLeapYear();                    // true
ChronoUnit.DAYS.between(d, LocalDate.of(2024, 12, 25)); // 301
LocalDate.parse("2024-07-04");     // from "yyyy-MM-dd"
```

### Gotchas

- `Stream.toList()` is Java 16. Here write `.collect(Collectors.toList())`.
- `pop()` and `remove()` on an empty `ArrayDeque` throw `NoSuchElementException`, while `poll()` and `peek()` return `null`. `ArrayDeque` also rejects `null` elements.
- `new BigDecimal(0.1)` keeps the `double`'s rounding error. Build it from a string: `new BigDecimal("0.1")`.
- Printing a `PriorityQueue` shows heap order, not sorted order. Only `poll()` comes out sorted.
