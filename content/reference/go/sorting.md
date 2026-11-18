# Sorting and Comparators

The `sort` package sorts slices in place in O(n log n). `sort.Ints`, `sort.Strings`, and `sort.Float64s` sort ascending, and `sort.Slice` takes a less function, `func(i, j int) bool`, that says whether element `i` comes before element `j`. `sort.Slice` is not stable: equal elements can come out in any order, so add a tie-break or use `sort.SliceStable`.

### Ascending

```go
import "sort"

nums := []int{5, 2, 9, 1}
sort.Ints(nums)
fmt.Println(nums) // [1 2 5 9]
words := []string{"pear", "Apple", "fig"}
sort.Strings(words)
fmt.Println(words) // [Apple fig pear], uppercase sorts before lowercase
prices := []float64{2.5, 0.99, 10}
sort.Float64s(prices)
fmt.Println(prices) // [0.99 2.5 10]
```

### Descending

```go
nums := []int{5, 2, 9, 1}
sort.Sort(sort.Reverse(sort.IntSlice(nums)))
fmt.Println(nums) // [9 5 2 1]
words := []string{"pear", "fig", "apple"}
sort.Sort(sort.Reverse(sort.StringSlice(words)))
fmt.Println(words) // [pear fig apple]
scores := []int{70, 95, 82}
sort.Slice(scores, func(i, j int) bool { return scores[i] > scores[j] })
fmt.Println(scores) // [95 82 70], the same with a less function
```

### By a key

The less function gets two indexes into the slice you pass, so it reads that same slice.

```go
words := []string{"banana", "kiwi", "fig", "apple"}
sort.Slice(words, func(i, j int) bool {
	return len(words[i]) < len(words[j]) // shorter first
})
fmt.Println(words) // [fig kiwi apple banana]

letters := []byte("listen")
sort.Slice(letters, func(i, j int) bool { return letters[i] < letters[j] })
fmt.Println(string(letters)) // eilnst, a key for anagrams
```

### By two keys

Compare the main key first, and the next key only when the main keys are equal. Each key can go its own way.

```go
type Player struct {
	Name  string
	Score int
}

players := []Player{{"Mia", 90}, {"Ben", 75}, {"Ava", 90}, {"Leo", 82}}
sort.Slice(players, func(i, j int) bool {
	if players[i].Score != players[j].Score {
		return players[i].Score > players[j].Score // score high to low
	}
	return players[i].Name < players[j].Name // ties: name A to Z
})
fmt.Println(players) // [{Ava 90} {Mia 90} {Leo 82} {Ben 75}]
```

### Stable: ties keep their order

```go
type Task struct {
	Name     string
	Priority int
}

tasks := []Task{{"email", 2}, {"deploy", 1}, {"lunch", 3}, {"review", 1}}
sort.SliceStable(tasks, func(i, j int) bool {
	return tasks[i].Priority < tasks[j].Priority
})
fmt.Println(tasks) // [{deploy 1} {review 1} {email 2} {lunch 3}]
```

### Intervals by start (a slice of slices by a column)

Each element of a `[][]int` is a row, so index the column inside the less function. Meeting rooms: sort by start, then a meeting that starts before the previous one ends is a clash.

```go
meetings := [][]int{{9, 10}, {1, 3}, {4, 8}, {2, 6}}
sort.Slice(meetings, func(i, j int) bool { return meetings[i][0] < meetings[j][0] })
fmt.Println(meetings) // [[1 3] [2 6] [4 8] [9 10]]
canAttendAll := true
for i := 1; i < len(meetings); i++ {
	if meetings[i][0] < meetings[i-1][1] {
		canAttendAll = false
	}
}
fmt.Println(canAttendAll) // false, [2 6] starts inside [1 3]

byEnd := [][2]int{{1, 9}, {2, 3}, {4, 5}} // fixed pairs sort the same way
sort.Slice(byEnd, func(i, j int) bool { return byEnd[i][1] < byEnd[j][1] })
fmt.Println(byEnd) // [[2 3] [4 5] [1 9]]
```

### Merge intervals

```go
intervals := [][]int{{8, 10}, {1, 3}, {2, 6}, {15, 18}}
sort.Slice(intervals, func(i, j int) bool { return intervals[i][0] < intervals[j][0] })
merged := [][]int{}
for _, cur := range intervals {
	last := len(merged) - 1
	if last < 0 || merged[last][1] < cur[0] {
		merged = append(merged, cur) // no overlap: start a new one
	} else if cur[1] > merged[last][1] {
		merged[last][1] = cur[1] // overlap: stretch the last one
	}
}
fmt.Println(merged) // [[1 6] [8 10] [15 18]]
```

### A custom order (largest number)

```go
import (
	"sort"
	"strconv"
	"strings"
)

nums := []int{3, 30, 34, 5, 9}
strs := make([]string, len(nums))
for i, n := range nums {
	strs[i] = strconv.Itoa(n)
}
sort.Slice(strs, func(i, j int) bool {
	return strs[i]+strs[j] > strs[j]+strs[i] // which order makes the bigger number
})
result := strings.Join(strs, "")
if result[0] == '0' {
	result = "0" // every number was 0
}
fmt.Println(result) // 9534330
```

### A map's entries by value

A map has no order, so copy its entries into a slice of structs and sort that.

```go
type entry struct {
	word  string
	count int
}

counts := map[string]int{"go": 3, "py": 5, "js": 3, "rs": 1}
entries := make([]entry, 0, len(counts))
for w, c := range counts {
	entries = append(entries, entry{w, c})
}
sort.Slice(entries, func(i, j int) bool {
	if entries[i].count != entries[j].count {
		return entries[i].count > entries[j].count // count high to low
	}
	return entries[i].word < entries[j].word // ties: word A to Z
})
fmt.Println(entries) // [{py 5} {go 3} {js 3} {rs 1}]
```

### Your own type: sort.Interface

`sort.Sort` takes any type with `Len`, `Less`, and `Swap`, the same three methods `container/heap` builds on.

```go
type ByLen []string

func (s ByLen) Len() int           { return len(s) }
func (s ByLen) Less(i, j int) bool { return len(s[i]) < len(s[j]) }
func (s ByLen) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }

words := []string{"banana", "fig", "kiwi"}
sort.Sort(ByLen(words)) // the conversion shares words' backing array
fmt.Println(words)      // [fig kiwi banana]
```

### Merge sort (divide and conquer)

```go
func mergeSort(a []int) []int {
	if len(a) <= 1 {
		return a
	}
	mid := len(a) / 2
	left, right := mergeSort(a[:mid]), mergeSort(a[mid:])
	out := make([]int, 0, len(a))
	i, j := 0, 0
	for i < len(left) && j < len(right) {
		if left[i] <= right[j] { // <= takes the left one first, which keeps it stable
			out = append(out, left[i])
			i++
		} else {
			out = append(out, right[j])
			j++
		}
	}
	out = append(out, left[i:]...)
	return append(out, right[j:]...)
}

fmt.Println(mergeSort([]int{5, 2, 4, 6, 1, 3})) // [1 2 3 4 5 6]
```

### Sweep line: rooms in use at once

Sort the starts and the ends separately. Every start takes a room, and every end at or before it frees one first.

```go
meetings := [][]int{{0, 30}, {5, 10}, {15, 20}}
starts, ends := []int{}, []int{}
for _, m := range meetings {
	starts = append(starts, m[0])
	ends = append(ends, m[1])
}
sort.Ints(starts)
sort.Ints(ends)
rooms, best, j := 0, 0, 0
for _, s := range starts {
	for j < len(ends) && ends[j] <= s {
		rooms-- // that meeting is over
		j++
	}
	rooms++
	if rooms > best {
		best = rooms
	}
}
fmt.Println(best) // 2
```

### Calls

| Call | Does |
| --- | --- |
| `sort.Ints(s)`, `sort.Strings(s)`, `sort.Float64s(s)` | ascending, in place |
| `sort.Sort(sort.Reverse(sort.IntSlice(s)))` | descending (also `StringSlice`, `Float64Slice`) |
| `sort.Slice(s, less)` | by your less function, not stable |
| `sort.SliceStable(s, less)` | the same, equal elements keep their order |
| `sort.Sort(x)`, `sort.Stable(x)` | a type with `Len`, `Less`, and `Swap` |
| `sort.IntsAreSorted(s)`, `sort.SliceIsSorted(s, less)` | checks the order |

### Gotchas

- The less function must be strict: `<` or `>`, never `<=`. With `<=` equal elements compare both ways and the result can come out wrong.
- Index the slice you sort: `sort.Slice(b, func(i, j int) bool { return a[i] < a[j] })` sorts `b` by the wrong data, with no error.
- Ties in `sort.Slice` and map iteration both come out in no fixed order. Add a tie-break, or `sort.SliceStable`, before printing.
- Go 1.16 has no generics, so there is no `slices.Sort`. `sort.Slice` takes an `interface{}`, and passing something that isn't a slice panics at run time.
