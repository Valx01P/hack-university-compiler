# Greedy Algorithms

A greedy algorithm makes the choice that looks best right now and never takes it back. It's usually one pass, often after a sort, so O(n) or O(n log n). It only works when a local best choice can't hurt later ones, so check a small counterexample before you trust it.

### Track the best so far: buy low, sell high

```cpp
#include <algorithm>
#include <climits>
#include <vector>

std::vector<int> prices = {7, 1, 5, 3, 6, 4};
int lowest = INT_MAX, profit = 0;
for (int p : prices) {
    lowest = std::min(lowest, p);            // the best day to have bought so far
    profit = std::max(profit, p - lowest);   // the best sale if you sell today
}
std::cout << profit << '\n';                 // 5, buy at 1 and sell at 6
```

### The farthest reach: jump game

```cpp
std::vector<int> jumps = {2, 3, 1, 1, 4};
int reach = 0;
bool canFinish = true;
for (int i = 0; i < static_cast<int>(jumps.size()); i++) {
    if (i > reach) {                          // this index can't be reached
        canFinish = false;
        break;
    }
    reach = std::max(reach, i + jumps[i]);
}
std::cout << std::boolalpha << canFinish << '\n';   // true

int minJumps(const std::vector<int>& nums) {   // the fewest jumps, by BFS-like levels
    int jumps = 0, end = 0, farthest = 0;
    for (int i = 0; i + 1 < static_cast<int>(nums.size()); i++) {
        farthest = std::max(farthest, i + nums[i]);
        if (i == end) {                        // this jump's range is used up
            jumps++;
            end = farthest;
        }
    }
    return jumps;
}
std::cout << minJumps({2, 3, 1, 1, 4}) << '\n';   // 2
```

### A running total that resets: gas station

When the tank goes negative, no station from the current start up to here can be the start, so try the next one. If the total gas covers the total cost, the last start works.

```cpp
std::vector<int> gas = {1, 2, 3, 4, 5}, cost = {3, 4, 5, 1, 2};
int total = 0, tank = 0, start = 0;
for (int i = 0; i < static_cast<int>(gas.size()); i++) {
    total += gas[i] - cost[i];
    tank += gas[i] - cost[i];
    if (tank < 0) {
        start = i + 1;                        // restart after the deficit
        tank = 0;
    }
}
std::cout << (total < 0 ? -1 : start) << '\n';   // 3
```

### Sort both, then two pointers: assign cookies

Give each child the smallest cookie that satisfies them, starting with the least greedy child.

```cpp
std::vector<int> greed = {1, 2, 3}, cookies = {1, 1};
std::sort(greed.begin(), greed.end());
std::sort(cookies.begin(), cookies.end());
std::size_t child = 0;
for (std::size_t c = 0; c < cookies.size() && child < greed.size(); c++) {
    if (cookies[c] >= greed[child]) child++;  // this cookie satisfies this child
}
std::cout << child << '\n';                   // 1
```

### Intervals by end: the fewest to remove

To keep the most intervals that don't overlap, always keep the one that ends first. Everything you remove is the answer to non-overlapping intervals.

```cpp
std::vector<std::vector<int>> intervals = {{1, 2}, {2, 3}, {3, 4}, {1, 3}};
std::sort(intervals.begin(), intervals.end(), [](const std::vector<int>& a, const std::vector<int>& b) {
    return a[1] < b[1];                       // by end
});
int removed = 0, lastEnd = INT_MIN;
for (const auto& iv : intervals) {
    if (iv[0] >= lastEnd) lastEnd = iv[1];    // fits after the last kept one: keep it
    else removed++;                           // overlaps: remove it
}
std::cout << removed << '\n';                 // 1, drop [1,3]
```

### Sweep line: the most at once

Meeting rooms II: sort the starts and the ends on their own. Walk the starts, and a start before the earliest end still running needs a new room.

```cpp
std::vector<std::vector<int>> meetings = {{0, 30}, {5, 10}, {15, 20}, {10, 15}};
std::vector<int> starts, ends;
for (const auto& m : meetings) {
    starts.push_back(m[0]);
    ends.push_back(m[1]);
}
std::sort(starts.begin(), starts.end());
std::sort(ends.begin(), ends.end());
int rooms = 0;
std::size_t e = 0;
for (int s : starts) {
    if (s < ends[e]) rooms++;                 // nothing has ended yet: open a room
    else e++;                                 // a meeting ended: take its room
}
std::cout << rooms << '\n';                   // 2
```

The same count with events: `+1` at each start and `-1` at each end, sorted by time with ends first on a tie (pairs sort that way, since -1 comes before 1).

```cpp harness
std::vector<std::vector<int>> meetings = {{0, 30}, {5, 10}, {15, 20}, {10, 15}};
{{code}}
```

```cpp
#include <utility>

std::vector<std::pair<int, int>> events;
for (const auto& m : meetings) {
    events.push_back({m[0], 1});
    events.push_back({m[1], -1});
}
std::sort(events.begin(), events.end());
int inUse = 0, most = 0;
for (const auto& [time, change] : events) {
    inUse += change;
    most = std::max(most, inUse);
}
std::cout << most << '\n';                    // 2
```

A min heap of end times does it too: pop every meeting that ended before the next start, push the new end, and the heap's largest size is the answer.

### Last positions: partition labels

```cpp
#include <string>

std::string s = "ababcbacadefegdehijhklij";
int last[26] = {};
for (int i = 0; i < static_cast<int>(s.size()); i++) last[s[i] - 'a'] = i;
int begin = 0, end = 0;
for (int i = 0; i < static_cast<int>(s.size()); i++) {
    end = std::max(end, last[s[i] - 'a']);    // this part must reach every copy of s[i]
    if (i == end) {
        std::cout << end - begin + 1 << ' ';  // 9 7 8
        begin = i + 1;
    }
}
```

### Majority vote (Boyer-Moore)

```cpp
std::vector<int> nums = {2, 2, 1, 1, 1, 2, 2};
int candidate = 0, count = 0;
for (int x : nums) {
    if (count == 0) candidate = x;    // the old candidate was cancelled out
    count += (x == candidate) ? 1 : -1;
}
std::cout << candidate << '\n';       // 2, the value seen more than n/2 times
```

### When greedy fails

With coins `{1, 3, 4}` and 6, taking the biggest coin first gives 4 + 1 + 1, three coins, but 3 + 3 is two. When a counterexample like that exists, use dynamic programming.

```cpp
std::vector<int> coins = {4, 3, 1};           // biggest first
int amount = 6, used = 0;
for (int c : coins) {
    while (amount >= c) {
        amount -= c;
        used++;
    }
}
std::cout << used << '\n';                    // 3, but the best is 2
```

### Gotchas

- Sort by the key the proof needs. Intervals by end keep the most, intervals by start are for merging.
- Ties matter in a sweep line. Decide whether a meeting ending at 10 frees its room for one starting at 10, and order the events to match.
- Start "best so far" values at the first element or at `INT_MIN` and `INT_MAX` from `<climits>`, never at 0, when values can be negative.
- `prices[i] - lowest` and running totals can overflow `int` on large inputs. Use `long long` when the limits say so.
