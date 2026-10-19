# Array Loop Patterns

Most patterns are a plain `for` with a different start, stop, or step. Here `a` is `int[] a = {10, 11, 12, 13, 14, 15};` and `n` is `a.length`.

### Reverse

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] a = {10, 11, 12, 13, 14, 15};
        int n = a.length;
        {{code}}
    }
}
```

```java
for (int i = n - 1; i >= 0; i--) {
    System.out.print(a[i] + " "); // 15 14 13 12 11 10
}
```

### Every other index

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] a = {10, 11, 12, 13, 14, 15};
        int n = a.length;
        {{code}}
    }
}
```

```java
for (int i = 0; i < n; i += 2) {
    System.out.print(a[i] + " "); // 10 12 14 (even indexes)
}
for (int i = 1; i < n; i += 2) {
    System.out.print(a[i] + " "); // 11 13 15 (odd indexes)
}
```

### Skip by value

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] a = {10, 11, 12, 13, 14, 15};
        int n = a.length;
        {{code}}
    }
}
```

```java
for (int v : a) {
    if (v % 2 != 0) continue;     // skip odd values
    System.out.print(v + " ");    // 10 12 14
}
```

### Every k-th, starting anywhere

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] a = {10, 11, 12, 13, 14, 15};
        int n = a.length;
        {{code}}
    }
}
```

```java
for (int i = 2; i < n; i += 3) {
    System.out.print(a[i] + " "); // 12 15
}
```

### Neighbors: compare with the previous one

```java
int[] temps = {3, 5, 4, 8};
for (int i = 1; i < temps.length; i++) {
    int change = temps[i] - temps[i - 1];
    System.out.print(change + " "); // 2 -1 4
}
```

### Two pointers from both ends

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] a = {10, 11, 12, 13, 14, 15};
        int n = a.length;
        {{code}}
    }
}
```

```java
int lo = 0;
int hi = n - 1;
while (lo < hi) {
    int tmp = a[lo];      // swap to reverse in place
    a[lo] = a[hi];
    a[hi] = tmp;
    lo++;
    hi--;
}
System.out.println(Arrays.toString(a)); // [15, 14, 13, 12, 11, 10]
```

### Every pair once

```java
int[] p = {1, 2, 3};
for (int i = 0; i < p.length; i++) {
    for (int j = i + 1; j < p.length; j++) {
        System.out.print(p[i] + "" + p[j] + " "); // 12 13 23
    }
}
```

### Wrap around

```java
int[] ring = {1, 2, 3, 4};
for (int i = 0; i < ring.length; i++) {
    int next = ring[(i + 1) % ring.length];  // last one wraps to index 0
    System.out.print(next + " ");            // 2 3 4 1
}
```

### Running total and prefix sums

```java
int[] v = {2, 4, 6, 8};
int[] prefix = new int[v.length + 1];        // prefix[i] = sum of first i values
for (int i = 0; i < v.length; i++) {
    prefix[i + 1] = prefix[i] + v[i];
}
System.out.println(Arrays.toString(prefix)); // [0, 2, 6, 12, 20]
System.out.println(prefix[3] - prefix[1]);   // 10, the sum of v[1..2]
```

### Sliding window of size k

```java harness
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int[] v = {2, 4, 6, 8};
        {{code}}
    }
}
```

```java
int k = 2;
int window = 0;
int best = Integer.MIN_VALUE;
for (int i = 0; i < v.length; i++) {
    window += v[i];
    if (i >= k) window -= v[i - k];           // drop the value that left
    if (i >= k - 1) best = Math.max(best, window);
}
System.out.println(best);                     // 14
```

### Filter into a new list

```java
import java.util.ArrayList;
import java.util.List;

int[] v = {2, 4, 6, 8};
List<Integer> big = new ArrayList<>();
for (int x : v) {
    if (x > 4) big.add(x);
}
System.out.println(big);                      // [6, 8]
```

### Pattern to loop header

| Pattern | Header |
| --- | --- |
| reverse | `for (int i = n - 1; i >= 0; i--)` |
| even indexes | `for (int i = 0; i < n; i += 2)` |
| odd indexes | `for (int i = 1; i < n; i += 2)` |
| previous and current | `for (int i = 1; i < n; i++)` |
| first half | `for (int i = 0; i < n / 2; i++)` |
| both ends | `while (lo < hi)` |
| all pairs | `for (i ...) for (int j = i + 1; j < n; j++)` |

### Gotchas

- Reverse starts at `n - 1`, not `n`, and the test is `i >= 0`.
- `v % 2 == 1` misses negative odd numbers (`-3 % 2` is `-1`). Test `v % 2 != 0`.
- Neighbor loops start at `1` (or stop at `n - 1`) so `a[i - 1]` and `a[i + 1]` stay in bounds.
- Changing `i` inside the body of a `for` (like `i++` again) silently skips elements. Use the step instead.
