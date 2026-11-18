# Greedy Algorithms

A greedy algorithm takes the choice that looks best right now and never goes back on it. That only works when the local choice can't hurt later, so the usual shape is: sort, then walk once and pick. Try a greedy idea on a small counterexample before you trust it.

### Track the best so far: buy low, sell high

```java
int[] prices = {7, 1, 5, 3, 6, 4};
int lowest = Integer.MAX_VALUE;
int bestProfit = 0;
for (int p : prices) {
    lowest = Math.min(lowest, p);                   // the cheapest day so far
    bestProfit = Math.max(bestProfit, p - lowest);  // if you sold today
}
System.out.println(bestProfit); // 5, buy at 1 and sell at 6
```

### The farthest reach: jump game

```java
static boolean canReach(int[] jumps) {
    int farthest = 0;
    for (int i = 0; i < jumps.length; i++) {
        if (i > farthest) {
            return false;                           // index i can't be reached
        }
        farthest = Math.max(farthest, i + jumps[i]);
    }
    return true;
}

static int minJumps(int[] jumps) {
    int count = 0;
    int end = 0;                                    // the reach of the jumps so far
    int farthest = 0;
    for (int i = 0; i < jumps.length - 1; i++) {
        farthest = Math.max(farthest, i + jumps[i]);
        if (i == end) {
            count++;                                // must jump again here
            end = farthest;
        }
    }
    return count;
}

System.out.println(canReach(new int[]{2, 3, 1, 1, 4})); // true
System.out.println(canReach(new int[]{3, 2, 1, 0, 4})); // false, stuck at the 0
System.out.println(minJumps(new int[]{2, 3, 1, 1, 4})); // 2
```

### A running total that resets: gas station

When the tank goes negative, no station up to here can be the start, so start again after it.

```java
static int startStation(int[] gas, int[] cost) {
    int total = 0;
    int tank = 0;
    int start = 0;
    for (int i = 0; i < gas.length; i++) {
        int gain = gas[i] - cost[i];
        total += gain;
        tank += gain;
        if (tank < 0) {
            start = i + 1;
            tank = 0;
        }
    }
    return total < 0 ? -1 : start;
}

System.out.println(startStation(new int[]{1, 2, 3, 4, 5}, new int[]{3, 4, 5, 1, 2})); // 3
System.out.println(startStation(new int[]{2, 3, 4}, new int[]{3, 4, 3}));             // -1
```

### Sort both, then two pointers: assign cookies

```java
import java.util.Arrays;

int[] greed = {1, 2, 3};
int[] cookies = {3, 1};
Arrays.sort(greed);
Arrays.sort(cookies);
int child = 0;
for (int c = 0; c < cookies.length && child < greed.length; c++) {
    if (cookies[c] >= greed[child]) {
        child++;                // the smallest cookie that is enough goes to this child
    }
}
System.out.println(child); // 2
```

### Intervals by end: the fewest to remove

Sort by end and keep every interval that starts after the last kept one ends. Ending early leaves the most room.

```java
int[][] intervals = {{1, 2}, {2, 3}, {3, 4}, {1, 3}};
Arrays.sort(intervals, (a, b) -> Integer.compare(a[1], b[1]));
int kept = 0;
int lastEnd = Integer.MIN_VALUE;
for (int[] iv : intervals) {
    if (iv[0] >= lastEnd) {     // touching at an end point is not an overlap here
        kept++;
        lastEnd = iv[1];
    }
}
System.out.println(intervals.length - kept); // 1, remove [1, 3]
```

### Sweep line: the most at once

Each meeting is +1 at its start and -1 at its end. Sort the events by time with the -1 first on a tie, so a room freed at 10 can be reused at 10, and keep a running count. A min-heap of end times gives the same answer.

```java
import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;

int[][] meetings = {{0, 30}, {5, 10}, {10, 15}, {15, 20}};
List<int[]> events = new ArrayList<>();
for (int[] m : meetings) {
    events.add(new int[]{m[0], 1});
    events.add(new int[]{m[1], -1});
}
events.sort((a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
int inUse = 0;
int most = 0;
for (int[] e : events) {
    inUse += e[1];
    most = Math.max(most, inUse);
}
System.out.println(most);         // 2

Arrays.sort(meetings, (a, b) -> Integer.compare(a[0], b[0]));
PriorityQueue<Integer> ends = new PriorityQueue<>();
for (int[] m : meetings) {
    if (!ends.isEmpty() && ends.peek() <= m[0]) {
        ends.poll();              // the earliest room is free again
    }
    ends.offer(m[1]);
}
System.out.println(ends.size());  // 2
```

### Last positions: partition labels

Cut the string into as many parts as you can so each letter appears in only one part.

```java
String s = "ababcbacadefegdehijhklij";
int[] last = new int[26];
for (int i = 0; i < s.length(); i++) {
    last[s.charAt(i) - 'a'] = i;            // the last index of each letter
}
List<Integer> sizes = new ArrayList<>();
int start = 0;
int end = 0;
for (int i = 0; i < s.length(); i++) {
    end = Math.max(end, last[s.charAt(i) - 'a']);
    if (i == end) {                         // every letter so far ends by here
        sizes.add(end - start + 1);
        start = i + 1;
    }
}
System.out.println(sizes); // [9, 7, 8]
```

### Majority vote (Boyer-Moore)

```java
int[] nums = {2, 2, 1, 1, 1, 2, 2};
int candidate = 0;
int count = 0;
for (int x : nums) {
    if (count == 0) {
        candidate = x;               // the old candidate was cancelled out
    }
    count += x == candidate ? 1 : -1;
}
System.out.println(candidate);       // 2, the value seen more than n/2 times
```

### When greedy fails

Taking the biggest coin first works for 1, 5, 10, 25, but not for every set of coins:

```java
int[] coins = {4, 3, 1};    // biggest first
int amount = 6;
int count = 0;
for (int c : coins) {
    count += amount / c;
    amount %= c;
}
System.out.println(count);  // 3, from 4 + 1 + 1, but 3 + 3 needs only 2
```

That problem needs dynamic programming (see Dynamic Programming).

### Gotchas

- A greedy rule needs a reason it's safe. If you can't find one, test it on small cases or reach for dynamic programming.
- To keep the most non-overlapping intervals, sort by end, not by start.
- Decide what a shared end point means: in most problems `[1, 2]` and `[2, 3]` don't overlap, so the test is `>=`, not `>`.
- Sort the starts and the ends with `Integer.compare`, never `a - b`, which overflows on extreme values.
