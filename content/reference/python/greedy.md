# Greedy Algorithms

A greedy algorithm takes the choice that looks best right now and never goes back. In code it's usually a sort and then one pass, or one pass that tracks the best so far. It's only right when you can argue that the local choice is safe, so try a small counterexample before you trust it.

### Track the best so far: buy low, sell high

```python
prices = [7, 1, 5, 3, 6, 4]
lowest = float("inf")
best = 0
for p in prices:
    lowest = min(lowest, p)          # the cheapest day so far
    best = max(best, p - lowest)     # selling today after buying then
print(best)                          # 5  buy at 1, sell at 6
```

### The farthest reach: jump game

```python
def can_jump(nums):
    reach = 0
    for i, step in enumerate(nums):
        if i > reach:
            return False             # no earlier index gets you here
        reach = max(reach, i + step)
    return True

def min_jumps(nums):
    jumps = end = reach = 0
    for i in range(len(nums) - 1):
        reach = max(reach, i + nums[i])
        if i == end:                 # the current jump runs out here
            jumps += 1
            end = reach
    return jumps

print(can_jump([2, 3, 1, 1, 4]), can_jump([3, 2, 1, 0, 4]))   # True False
print(min_jumps([2, 3, 1, 1, 4]))                            # 2
```

### A running total that resets: gas station

```python
def start_station(gas, cost):
    if sum(gas) < sum(cost):
        return -1                    # not enough gas for the whole loop
    tank = start = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:                 # nothing from start to i works, so try i + 1
            start = i + 1
            tank = 0
    return start

print(start_station([1, 2, 3, 4, 5], [3, 4, 5, 1, 2]))   # 3
print(start_station([2, 3, 4], [3, 4, 3]))               # -1
```

### Sort both, then two pointers: assign cookies

```python
greed, cookies = [1, 2, 3], [1, 1]
greed.sort()
cookies.sort()
child = 0
for size in cookies:                 # the smallest cookie that fits the least greedy child
    if child < len(greed) and size >= greed[child]:
        child += 1
print(child)                         # 1
```

### Intervals by end: the fewest to remove

Keep the interval that ends first. It leaves the most room for the rest.

```python
intervals = [[1, 2], [2, 3], [3, 4], [1, 3]]
intervals.sort(key=lambda iv: iv[1])
kept = 0
end = float("-inf")
for start, finish in intervals:
    if start >= end:                 # starts after the last kept one ends
        kept += 1
        end = finish
print(len(intervals) - kept)         # 1  remove [1, 3]
```

### Sweep line: the most at once

Turn each interval into a start event (+1) and an end event (-1), sort them, and keep a running total. At the same time, `(t, -1)` sorts before `(t, 1)`, so a meeting that ends frees its room before the next one starts.

```python
meetings = [[0, 30], [5, 10], [15, 20], [10, 15]]
events = []
for s, e in meetings:
    events.append((s, 1))
    events.append((e, -1))
events.sort()
rooms = best = 0
for _, change in events:
    rooms += change
    best = max(best, rooms)
print(best)                          # 2
```

The same answer with a heap of end times: sort by start, and reuse the room that frees up first.

```python
import heapq

meetings = [[0, 30], [5, 10], [15, 20], [10, 15]]
meetings.sort()
ends = []                            # end times of the rooms in use
for s, e in meetings:
    if ends and ends[0] <= s:
        heapq.heappop(ends)          # that room is free again
    heapq.heappush(ends, e)
print(len(ends))                     # 2
```

### Last positions: partition labels

```python
s = "ababcbacadefegdehijhklij"
last = {ch: i for i, ch in enumerate(s)}
sizes = []
start = end = 0
for i, ch in enumerate(s):
    end = max(end, last[ch])         # this part must reach every copy of ch
    if i == end:
        sizes.append(end - start + 1)
        start = i + 1
print(sizes)                         # [9, 7, 8]
```

### Majority vote (Boyer-Moore)

```python
nums = [2, 2, 1, 1, 1, 2, 2]
candidate, count = None, 0
for x in nums:
    if count == 0:
        candidate = x
    count += 1 if x == candidate else -1
print(candidate)                     # 2
```

### When greedy fails

Coins `[1, 3, 4]` for 6: taking the biggest coin first gives 4 + 1 + 1, but 3 + 3 uses fewer. That one needs a DP table (see Dynamic Programming).

```python
coins, amount = [1, 3, 4], 6
used = 0
for c in sorted(coins, reverse=True):
    used += amount // c
    amount %= c
print(used)                          # 3  but 3 + 3 is only 2 coins
```

### Gotchas

- Sort by the right field: by end to keep the most intervals, by start to merge them.
- Decide whether touching intervals overlap: `[1, 2]` and `[2, 3]` usually don't, so the test is `start >= end`, not `>`.
- Start "the lowest so far" at `float("inf")` or the first item, never at 0.
- A greedy pass that feels right can still be wrong. Check it on a small case by hand, or against a brute force with `itertools`.
