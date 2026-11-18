# Binary Search

Binary search halves a sorted range at every step, so a million values take about 20 steps. Java has `Arrays.binarySearch` and `Collections.binarySearch` for an exact match, and `TreeSet` and `TreeMap` for the nearest value. Lower and upper bounds you write by hand.

### Built-in search

A missing value gives a negative result, `-(insertion point) - 1`, which tells you where it would go.

```java
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

int[] a = {1, 3, 5, 7, 9};
System.out.println(Arrays.binarySearch(a, 7));        // 3, the index
System.out.println(Arrays.binarySearch(a, 4));        // -3, missing
int r = Arrays.binarySearch(a, 4);
System.out.println(r >= 0 ? r : -r - 1);              // 2, where 4 would go (search insert position)
System.out.println(Arrays.binarySearch(a, 1, 4, 9));  // -5, only indexes 1 to 3 are searched

List<String> names = List.of("ana", "ben", "cy");
System.out.println(Collections.binarySearch(names, "bo"));  // -3, would go at index 2
```

### By hand: an exact match

```java
static int search(int[] a, int target) {
    int lo = 0;
    int hi = a.length - 1;             // both ends inclusive
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;  // (lo + hi) / 2 can overflow
        if (a[mid] == target) {
            return mid;
        } else if (a[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return -1;
}

int[] a = {1, 3, 5, 7, 9};
System.out.println(search(a, 9));  // 4
System.out.println(search(a, 4));  // -1
```

### Lower bound and upper bound

The lower bound is the first index whose value is `>= target`, the upper bound the first index whose value is `> target`. Both give `a.length` when no value qualifies. Here `hi` is exclusive and the loop runs `while (lo < hi)`.

```java
static int lowerBound(int[] a, int target) {
    int lo = 0;
    int hi = a.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

static int upperBound(int[] a, int target) {
    int lo = 0;
    int hi = a.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] <= target) {        // the only change: <= instead of <
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

int[] a = {1, 2, 2, 2, 5};
System.out.println(lowerBound(a, 2));  // 1
System.out.println(upperBound(a, 2));  // 4
System.out.println(lowerBound(a, 3));  // 4, where 3 would go
System.out.println(lowerBound(a, 9));  // 5, past the end
```

### First and last position

```java harness
static int lowerBound(int[] a, int target) {
    int lo = 0, hi = a.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
}

static int upperBound(int[] a, int target) {
    int lo = 0, hi = a.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] <= target) lo = mid + 1; else hi = mid;
    }
    return lo;
}

{{code}}
```

```java
int[] a = {5, 7, 7, 8, 8, 10};
for (int target : new int[]{8, 6}) {
    int first = lowerBound(a, target);
    if (first == a.length || a[first] != target) {
        System.out.println("-1 -1");                          // 6 is missing
    } else {
        System.out.println(first + " " + (upperBound(a, target) - 1)); // 3 4 for 8
    }
}
System.out.println(upperBound(a, 7) - lowerBound(a, 7));      // 2, how many 7s
```

### Binary search on the answer

When a guess either works or doesn't, and every bigger guess also works, search for the smallest guess that works. Koko eats piles of bananas at `speed` per hour and must finish in `hours`:

```java
static boolean canFinish(int[] piles, int speed, int hours) {
    long needed = 0;
    for (int p : piles) {
        needed += ((long) p + speed - 1) / speed;   // ceiling of p / speed
    }
    return needed <= hours;
}

int[] piles = {3, 6, 7, 11};
int lo = 1;
int hi = Arrays.stream(piles).max().getAsInt();     // the biggest pile always works
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (canFinish(piles, mid, 8)) {
        hi = mid;                                   // mid works, try smaller
    } else {
        lo = mid + 1;                               // too slow
    }
}
System.out.println(lo); // 4
```

### Search a rotated sorted array

A sorted array turned at some point, like `{4, 5, 6, 7, 0, 1, 2}`. One half of every range is still sorted: find it, check whether the target lies inside it, and keep the half that can hold the target.

```java
static int searchRotated(int[] a, int target) {
    int lo = 0;
    int hi = a.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) {
            return mid;
        }
        if (a[lo] <= a[mid]) {                          // the left half is sorted
            if (a[lo] <= target && target < a[mid]) {
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        } else {                                        // the right half is sorted
            if (a[mid] < target && target <= a[hi]) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
    }
    return -1;
}

static int findMin(int[] a) {                           // the smallest value, where the rotation starts
    int lo = 0;
    int hi = a.length - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] > a[hi]) {
            lo = mid + 1;                               // the drop is to the right of mid
        } else {
            hi = mid;
        }
    }
    return a[lo];
}

int[] a = {4, 5, 6, 7, 0, 1, 2};
System.out.println(searchRotated(a, 0) + " " + searchRotated(a, 3));  // 4 -1
System.out.println(findMin(a));                                       // 0
```

### TreeSet: the nearest value

```java
import java.util.TreeSet;

TreeSet<Integer> set = new TreeSet<>(List.of(10, 20, 30));
System.out.println(set.floor(25));                   // 20, largest <= 25
System.out.println(set.ceiling(25));                 // 30, smallest >= 25
System.out.println(set.lower(20));                   // 10, largest < 20
System.out.println(set.higher(20));                  // 30, smallest > 20
System.out.println(set.ceiling(31));                 // null, nothing >= 31
System.out.println(set.pollFirst() + " " + set);     // 10 [20, 30], removes the smallest
```

### TreeMap: the latest value at or before a time

A time-based key-value store keeps a `TreeMap` from time to value for each key, and `floorEntry(t)` is the latest entry at or before `t`.

```java
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

Map<String, TreeMap<Integer, String>> store = new HashMap<>();
store.computeIfAbsent("foo", k -> new TreeMap<>()).put(1, "bar");
store.computeIfAbsent("foo", k -> new TreeMap<>()).put(4, "baz");
TreeMap<Integer, String> times = store.get("foo");
System.out.println(times.floorEntry(3).getValue());                  // bar, the latest at or before 3
System.out.println(times.floorKey(5));                               // 4
System.out.println(times.floorEntry(0));                             // null, nothing that early
System.out.println(times.ceilingKey(2) + " " + times.higherKey(4));  // 4 null
System.out.println(times.pollFirstEntry() + " " + times);            // 1=bar {4=baz}
```

### Calls

| Call | Returns, in O(log n) |
| --- | --- |
| `Arrays.binarySearch(a, x)` | an index of `x`, or `-(insertion point) - 1` |
| `Collections.binarySearch(list, x)` | the same, on a sorted `List` |
| `floor(x)`, `floorKey(x)`, `floorEntry(x)` | the largest `<= x`, or `null` |
| `ceiling(x)`, `ceilingKey(x)` | the smallest `>= x`, or `null` |
| `lower(x)`, `lowerKey(x)` | the largest `< x`, or `null` |
| `higher(x)`, `higherKey(x)` | the smallest `> x`, or `null` |
| `first()`, `firstKey()` | the smallest, throws when empty |
| `pollFirst()`, `pollFirstEntry()` | removes the smallest, `null` when empty |

### Gotchas

- On unsorted data binary search gives wrong answers, with no error. Sort first.
- With duplicates, `Arrays.binarySearch` returns any matching index, not the first. Use a lower bound.
- `int k = set.floor(x);` throws `NullPointerException` when nothing qualifies. Store it in an `Integer` and check for `null`.
- In the `while (lo < hi)` form, move `lo` to `mid + 1`, never to `mid`. Since `mid` rounds down, `lo = mid` can loop forever.
