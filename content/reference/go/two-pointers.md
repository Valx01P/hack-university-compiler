# Two Pointers and Windows

Two indexes that move with a plan replace a loop inside a loop: they close in from both ends of sorted data, read and write in place, or mark the edges of a window that slides along. Prefix sums answer "what is the sum of this range" in O(1) after one pass. Each pattern here runs in O(n).

### Both ends: two sum on a sorted slice

```go
nums := []int{2, 7, 11, 15}
target := 18
i, j := 0, len(nums)-1
for i < j {
	sum := nums[i] + nums[j]
	if sum == target {
		break
	} else if sum < target {
		i++ // too small: move the low end up
	} else {
		j-- // too big: move the high end down
	}
}
fmt.Println(i+1, j+1) // 2 3, the 1-based positions of 7 and 11
```

### Both ends: a palindrome, skipping punctuation

```go
import "unicode"

func isPalindrome(s string) bool {
	r := []rune(s)
	i, j := 0, len(r)-1
	for i < j {
		if !unicode.IsLetter(r[i]) && !unicode.IsDigit(r[i]) {
			i++
		} else if !unicode.IsLetter(r[j]) && !unicode.IsDigit(r[j]) {
			j--
		} else if unicode.ToLower(r[i]) != unicode.ToLower(r[j]) {
			return false
		} else {
			i++
			j--
		}
	}
	return true
}

fmt.Println(isPalindrome("A man, a plan, a canal: Panama")) // true
fmt.Println(isPalindrome("race a car"))                     // false
```

### Read and write: compact in place

One index reads every element, the other marks where the next kept one goes.

```go
nums := []int{1, 1, 2, 3, 3, 3, 4}
w := 1 // remove duplicates from sorted data
for r := 1; r < len(nums); r++ {
	if nums[r] != nums[w-1] {
		nums[w] = nums[r]
		w++
	}
}
fmt.Println(nums[:w]) // [1 2 3 4]

zeros := []int{0, 1, 0, 3, 12}
w = 0 // move zeroes to the end, order kept
for _, x := range zeros {
	if x != 0 {
		zeros[w] = x
		w++
	}
}
for ; w < len(zeros); w++ {
	zeros[w] = 0
}
fmt.Println(zeros) // [1 3 12 0 0]
```

### Two slices: merge, and a subsequence

```go
a, b := []int{1, 4, 7}, []int{2, 3, 8, 9}
out := make([]int, 0, len(a)+len(b))
i, j := 0, 0
for i < len(a) && j < len(b) {
	if a[i] <= b[j] {
		out = append(out, a[i])
		i++
	} else {
		out = append(out, b[j])
		j++
	}
}
out = append(out, a[i:]...) // one of these two is empty
out = append(out, b[j:]...)
fmt.Println(out) // [1 2 3 4 7 8 9]

s, t := "ace", "abcde"
k := 0
for p := 0; p < len(t) && k < len(s); p++ {
	if s[k] == t[p] {
		k++ // matched the next letter of s
	}
}
fmt.Println(k == len(s)) // true, "ace" is a subsequence of "abcde"
```

### Fixed window: the best k in a row

```go
nums := []int{2, 1, 5, 1, 3, 2}
k := 3
sum := 0
for i := 0; i < k; i++ {
	sum += nums[i]
}
best := sum
for i := k; i < len(nums); i++ {
	sum += nums[i] - nums[i-k] // add the new one, drop the oldest
	if sum > best {
		best = sum
	}
}
fmt.Println(best) // 9, from 5 1 3
```

### Variable window with a map: longest run without repeats

```go
s := "abcabcbb"
last := map[byte]int{} // where each byte was seen last
best, left := 0, 0
for right := 0; right < len(s); right++ {
	if i, ok := last[s[right]]; ok && i >= left {
		left = i + 1 // jump past the earlier copy
	}
	last[s[right]] = right
	if right-left+1 > best {
		best = right - left + 1
	}
}
fmt.Println(best) // 3, "abc"
```

### Variable window: the shortest run with a sum of at least target

```go
nums := []int{2, 3, 1, 2, 4, 3}
target := 7
best := len(nums) + 1
sum, left := 0, 0
for right, x := range nums {
	sum += x
	for sum >= target { // shrink while it still qualifies
		if right-left+1 < best {
			best = right - left + 1
		}
		sum -= nums[left]
		left++
	}
}
if best > len(nums) {
	best = 0 // no run was long enough
}
fmt.Println(best) // 2, from 4 3
```

### Letter counts in a window (anagrams)

Arrays compare with `==`, so two `[26]int` counts check a whole window at once.

```go
s, p := "cbaebabacd", "abc"
var need, have [26]int
for i := 0; i < len(p); i++ {
	need[p[i]-'a']++
}
starts := []int{}
for i := 0; i < len(s); i++ {
	have[s[i]-'a']++
	if i >= len(p) {
		have[s[i-len(p)]-'a']-- // the letter that just left the window
	}
	if have == need {
		starts = append(starts, i-len(p)+1)
	}
}
fmt.Println(starts) // [0 6]
```

### Prefix sums

```go
nums := []int{3, 1, 4, 1, 5}
prefix := make([]int, len(nums)+1) // prefix[i] is the sum of nums[:i]
for i, x := range nums {
	prefix[i+1] = prefix[i] + x
}
fmt.Println(prefix)                // [0 3 4 8 9 14]
fmt.Println(prefix[4] - prefix[1]) // 6, the sum of nums[1:4]
```

### Prefix sums with a map: subarrays that sum to k

A run from after index `j` to `i` sums to `k` when `prefix[i] - prefix[j] == k`. Count how often each prefix sum has appeared, and look up `sum - k`. Negative numbers are fine here, unlike in a window.

```go
nums := []int{1, 2, 3, -2, 2}
k := 3
seen := map[int]int{0: 1} // the empty prefix, before any number
count, sum := 0, 0
for _, x := range nums {
	sum += x
	count += seen[sum-k] // a missing key reads as 0
	seen[sum]++
}
fmt.Println(count) // 4: [1 2] [3] [2 3 -2] [3 -2 2]
```

### Prefix and suffix products

```go
nums := []int{1, 2, 3, 4}
out := make([]int, len(nums))
left := 1
for i := range nums {
	out[i] = left // the product of everything before i
	left *= nums[i]
}
right := 1
for i := len(nums) - 1; i >= 0; i-- {
	out[i] *= right // times the product of everything after i
	right *= nums[i]
}
fmt.Println(out) // [24 12 8 6]
```

### Which pattern

| Problem shape | Pattern |
| --- | --- |
| a pair in sorted data | both ends, moving inward |
| filter or compact in place | a read index and a write index |
| the best run of exactly k | a fixed window |
| the longest or shortest run with a rule | a variable window, shrinking with `for` |
| the sum of any range | prefix sums |
| count runs that sum to k, negatives allowed | prefix sums with a map |

### Gotchas

- Shrink a variable window with `for`, not `if`. One new value can force several steps.
- `s[i]` is a byte, so `s[i]-'a'` works for lowercase ASCII only. Convert to `[]rune` first for other text, and use a map instead of `[26]int`.
- A sum window only works on non-negative numbers, because adding a negative can shrink the sum. Use prefix sums with a map instead.
- Go 1.16 has no built-in `min` or `max` for ints. Write the `if` or a small `maxInt` helper.
