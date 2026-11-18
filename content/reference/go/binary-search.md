# Binary Search

Binary search halves a sorted range at every step, so a million values take about 20 looks. `sort.SearchInts` returns the lower bound, the first index whose value is at least the target, and `sort.Search(n, f)` returns the first index where `f` is true. Neither one tells you whether the value is there, so check.

### Built-in search: sort.SearchInts

```go
import "sort"

nums := []int{1, 3, 5, 5, 5, 8}
i := sort.SearchInts(nums, 5)
fmt.Println(i, i < len(nums) && nums[i] == 5) // 2 true, the first 5
j := sort.SearchInts(nums, 4)
fmt.Println(j, j < len(nums) && nums[j] == 4) // 2 false, 4 would go at index 2
fmt.Println(sort.SearchInts(nums, 9))         // 6, len(nums): past the end

words := []string{"ant", "bee", "cat"}
fmt.Println(sort.SearchStrings(words, "bee")) // 1
```

The insert position for a value is exactly `sort.SearchInts(nums, x)`.

### By hand: an exact match

```go
func binarySearch(nums []int, target int) int {
	lo, hi := 0, len(nums)-1
	for lo <= hi {
		mid := lo + (hi-lo)/2
		if nums[mid] == target {
			return mid
		} else if nums[mid] < target {
			lo = mid + 1 // the target is to the right
		} else {
			hi = mid - 1 // the target is to the left
		}
	}
	return -1
}

nums := []int{-1, 0, 3, 5, 9, 12}
fmt.Println(binarySearch(nums, 9)) // 4
fmt.Println(binarySearch(nums, 2)) // -1
```

### Lower bound and upper bound with sort.Search

`f` must be false for a while and then true for the rest. The lower bound asks `>= target`, the upper bound asks `> target`, and the count of a value is their difference.

```go
nums := []int{1, 3, 5, 5, 5, 8}
target := 5
lower := sort.Search(len(nums), func(i int) bool { return nums[i] >= target })
upper := sort.Search(len(nums), func(i int) bool { return nums[i] > target })
fmt.Println(lower, upper)  // 2 5
fmt.Println(upper - lower) // 3 copies of 5
```

### Lower bound by hand

```go
func lowerBound(nums []int, target int) int {
	lo, hi := 0, len(nums) // hi is one past the end
	for lo < hi {
		mid := lo + (hi-lo)/2
		if nums[mid] < target { // <= here gives the upper bound
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

fmt.Println(lowerBound([]int{1, 3, 5, 5, 8}, 5)) // 2
fmt.Println(lowerBound([]int{1, 3, 5, 5, 8}, 9)) // 5
```

### First and last position

```go
func firstLast(nums []int, target int) (int, int) {
	first := sort.SearchInts(nums, target)
	if first == len(nums) || nums[first] != target {
		return -1, -1 // missing
	}
	after := sort.Search(len(nums), func(i int) bool { return nums[i] > target })
	return first, after - 1
}

fmt.Println(firstLast([]int{5, 7, 7, 8, 8, 10}, 8)) // 3 4
fmt.Println(firstLast([]int{5, 7, 7, 8, 8, 10}, 6)) // -1 -1
```

### Binary search on the answer

Koko eats piles of bananas at some speed and has `h` hours. If a speed works, every faster one works too, so "works" is false and then true over the speeds, and a lower bound finds the slowest one that works.

```go
func hoursAt(piles []int, speed int) int {
	hours := 0
	for _, p := range piles {
		hours += (p + speed - 1) / speed // ceiling division
	}
	return hours
}

piles := []int{3, 6, 7, 11}
h := 8
lo, hi := 1, 0
for _, p := range piles {
	if p > hi {
		hi = p // the biggest pile: no need to go faster
	}
}
for lo < hi {
	mid := lo + (hi-lo)/2
	if hoursAt(piles, mid) <= h {
		hi = mid // mid works, try slower
	} else {
		lo = mid + 1 // too slow
	}
}
fmt.Println(lo) // 4

speed := 1 + sort.Search(11, func(i int) bool { return hoursAt(piles, i+1) <= h })
fmt.Println(speed) // 4, the same search with sort.Search over speeds 1 to 11
```

### Search a rotated sorted slice

One half around `mid` is always sorted. Check whether the target falls inside that half, and keep the half that can hold it.

```go
func searchRotated(nums []int, target int) int {
	lo, hi := 0, len(nums)-1
	for lo <= hi {
		mid := lo + (hi-lo)/2
		if nums[mid] == target {
			return mid
		}
		if nums[lo] <= nums[mid] { // the left half is sorted
			if nums[lo] <= target && target < nums[mid] {
				hi = mid - 1
			} else {
				lo = mid + 1
			}
		} else { // the right half is sorted
			if nums[mid] < target && target <= nums[hi] {
				lo = mid + 1
			} else {
				hi = mid - 1
			}
		}
	}
	return -1
}

nums := []int{4, 5, 6, 7, 0, 1, 2}
fmt.Println(searchRotated(nums, 0)) // 4
fmt.Println(searchRotated(nums, 3)) // -1

lo, hi := 0, len(nums)-1
for lo < hi { // the smallest value, where the rotation starts
	mid := lo + (hi-lo)/2
	if nums[mid] > nums[hi] {
		lo = mid + 1
	} else {
		hi = mid
	}
}
fmt.Println(lo, nums[lo]) // 4 0
```

### The latest value at or before a time

A time-based store keeps each key's entries in time order, so the answer for time `t` sits just before the first entry after `t`.

```go
type entry struct {
	time  int
	value string
}

store := map[string][]entry{}
store["foo"] = append(store["foo"], entry{1, "bar"}, entry{4, "baz"})

get := func(key string, t int) string {
	entries := store[key] // a missing key gives a nil slice, length 0
	i := sort.Search(len(entries), func(i int) bool { return entries[i].time > t })
	if i == 0 {
		return "" // nothing at or before t
	}
	return entries[i-1].value
}
fmt.Println(get("foo", 3))        // bar
fmt.Println(get("foo", 5))        // baz
fmt.Printf("%q\n", get("foo", 0)) // ""
```

### Calls

| Call | Does |
| --- | --- |
| `sort.SearchInts(s, x)` | first index with `s[i] >= x`, or `len(s)` |
| `sort.SearchStrings(s, x)` | the same for a sorted `[]string` |
| `sort.SearchFloat64s(s, x)` | the same for a sorted `[]float64` |
| `sort.Search(n, f)` | first `i` in `0..n-1` where `f(i)` is true, or `n` |

Each takes O(log n) calls.

### Gotchas

- The data must be sorted ascending. On unsorted data these return a wrong index with no error. For a descending slice, search with `s[i] <= x`.
- The result is an insert position, not a match. Check `i < len(s) && s[i] == x` before reading `s[i]`, or it panics with index out of range when `i == len(s)`.
- In the `lo < hi` form, move `lo` to `mid + 1`, never to `mid`. `mid` rounds down, so `lo = mid` can loop forever.
- `int` is 64 bits on Piston, so `(lo + hi) / 2` can't overflow here, but `lo + (hi-lo)/2` is the habit that is safe everywhere.
