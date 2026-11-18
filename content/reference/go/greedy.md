# Greedy Algorithms

A greedy algorithm makes the choice that looks best right now and never goes back on it. It's usually a sort followed by one pass, or one pass that tracks the best so far, so it runs in O(n log n) or O(n). It's only right when you can argue that the local choice is safe, so test it on small cases.

### Track the best so far: buy low, sell high

```go
prices := []int{7, 1, 5, 3, 6, 4}
lowest, best := prices[0], 0
for _, p := range prices[1:] {
	if p-lowest > best {
		best = p - lowest // selling today beats every earlier plan
	}
	if p < lowest {
		lowest = p // a cheaper day to buy
	}
}
fmt.Println(best) // 5, buy at 1 and sell at 6
```

### The farthest reach: jump game

```go
func canJump(nums []int) bool {
	reach := 0 // the farthest index you can get to so far
	for i, jump := range nums {
		if i > reach {
			return false // stuck before i
		}
		if i+jump > reach {
			reach = i + jump
		}
	}
	return true
}

fmt.Println(canJump([]int{2, 3, 1, 1, 4}), canJump([]int{3, 2, 1, 0, 4})) // true false

func minJumps(nums []int) int { // the fewest jumps, by BFS-like levels
	jumps, end, farthest := 0, 0, 0
	for i := 0; i+1 < len(nums); i++ {
		if i+nums[i] > farthest {
			farthest = i + nums[i]
		}
		if i == end { // this jump's range is used up
			jumps++
			end = farthest
		}
	}
	return jumps
}

fmt.Println(minJumps([]int{2, 3, 1, 1, 4})) // 2
```

### A running total that resets: gas station

```go
gas := []int{1, 2, 3, 4, 5}
cost := []int{3, 4, 5, 1, 2}
total, tank, start := 0, 0, 0
for i := range gas {
	total += gas[i] - cost[i]
	tank += gas[i] - cost[i]
	if tank < 0 {
		start, tank = i+1, 0 // no start up to i works, so try the next one
	}
}
if total < 0 {
	start = -1 // not enough gas in all
}
fmt.Println(start) // 3
```

### Sort both, then two pointers: assign cookies

```go
import "sort"

greed := []int{1, 2, 3}
cookies := []int{1, 1}
sort.Ints(greed)
sort.Ints(cookies)
child := 0
for _, c := range cookies {
	if child < len(greed) && c >= greed[child] {
		child++ // the smallest cookie that satisfies the least greedy child
	}
}
fmt.Println(child) // 1
```

### Intervals by end: the fewest to remove

Keep the interval that ends first, since it leaves the most room for the rest.

```go
import (
	"math"
	"sort"
)

intervals := [][]int{{1, 2}, {2, 3}, {3, 4}, {1, 3}}
sort.Slice(intervals, func(i, j int) bool { return intervals[i][1] < intervals[j][1] })
kept, end := 0, math.MinInt64
for _, iv := range intervals {
	if iv[0] >= end { // starts at or after the last kept one ends
		kept++
		end = iv[1]
	}
}
fmt.Println(len(intervals) - kept) // 1, remove [1 3]
```

### Sweep line: the most at once

Turn every interval into a start event (+1) and an end event (-1), sort them by time, and keep a running count.

```go
meetings := [][]int{{0, 30}, {5, 10}, {15, 20}, {10, 15}}
events := [][2]int{} // {time, +1 or -1}
for _, m := range meetings {
	events = append(events, [2]int{m[0], 1}, [2]int{m[1], -1})
}
sort.Slice(events, func(i, j int) bool {
	if events[i][0] != events[j][0] {
		return events[i][0] < events[j][0]
	}
	return events[i][1] < events[j][1] // at the same time, an end (-1) comes first
})
inUse, most := 0, 0
for _, e := range events {
	inUse += e[1]
	if inUse > most {
		most = inUse
	}
}
fmt.Println(most) // 2
```

### Last positions: partition labels

```go
s := "ababcbacadefegdehijhklij"
var last [26]int
for i := 0; i < len(s); i++ {
	last[s[i]-'a'] = i // where each letter appears for the last time
}
sizes := []int{}
start, end := 0, 0
for i := 0; i < len(s); i++ {
	if last[s[i]-'a'] > end {
		end = last[s[i]-'a'] // this part must reach that far
	}
	if i == end {
		sizes = append(sizes, end-start+1)
		start = i + 1
	}
}
fmt.Println(sizes) // [9 7 8]
```

### Majority vote (Boyer-Moore)

```go
nums := []int{2, 2, 1, 1, 1, 2, 2}
candidate, count := 0, 0
for _, x := range nums {
	if count == 0 {
		candidate = x // the old candidate was cancelled out
	}
	if x == candidate {
		count++
	} else {
		count--
	}
}
fmt.Println(candidate) // 2, the value seen more than n/2 times
```

### When greedy fails

Taking the biggest coin first doesn't always give the fewest coins. Use dynamic programming when no simple rule is provably safe.

```go
coins := []int{4, 3, 1} // biggest first
amount, used := 6, 0
for _, c := range coins {
	used += amount / c
	amount %= c
}
fmt.Println(used) // 3, from 4 + 1 + 1, but 3 + 3 needs only 2
```

### Gotchas

- A greedy rule needs a reason it's safe. If you can't find one, check it against brute force on small inputs.
- To keep the most non-overlapping intervals, sort by end, not by start.
- Decide what a shared end point means: in most problems `[1 2]` and `[2 3]` don't overlap, so the test is `>=`, not `>`.
- `sort.Slice` isn't stable, so ties come out in any order. When ties matter (an end before a start at the same time), compare a second key.
