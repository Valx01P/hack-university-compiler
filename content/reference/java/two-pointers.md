# Two Pointers and Windows

Two indexes moving through an array or a string replace a nested loop with one pass. They start at both ends and move inward, or both start on the left as the edges of a window. A prefix sum array answers any range sum in O(1).

### Both ends: two sum on a sorted array

```java
int[] nums = {2, 7, 11, 15};
int target = 18;
int left = 0;
int right = nums.length - 1;
while (left < right) {
    int sum = nums[left] + nums[right];
    if (sum == target) {
        System.out.println((left + 1) + " " + (right + 1)); // 2 3, 1-based
        break;
    } else if (sum < target) {
        left++;                  // need a bigger sum
    } else {
        right--;                 // need a smaller sum
    }
}
```

### Both ends: a palindrome, skipping punctuation

```java
String s = "A man, a plan, a canal: Panama";
int i = 0;
int j = s.length() - 1;
boolean ok = true;
while (i < j) {
    if (!Character.isLetterOrDigit(s.charAt(i))) {
        i++;
    } else if (!Character.isLetterOrDigit(s.charAt(j))) {
        j--;
    } else if (Character.toLowerCase(s.charAt(i)) != Character.toLowerCase(s.charAt(j))) {
        ok = false;
        break;
    } else {
        i++;
        j--;
    }
}
System.out.println(ok); // true
```

### Read and write: move zeroes, remove duplicates

```java
import java.util.Arrays;

int[] zeros = {0, 1, 0, 3, 12};
int w = 0;
for (int x : zeros) {
    if (x != 0) zeros[w++] = x;                  // keep it, in order
}
Arrays.fill(zeros, w, zeros.length, 0);          // zero the rest
System.out.println(Arrays.toString(zeros));      // [1, 3, 12, 0, 0]

int[] nums = {1, 1, 2, 3, 3, 3, 4};
int write = 1;                                   // nums[0] up to write holds the kept values
for (int read = 1; read < nums.length; read++) {
    if (nums[read] != nums[write - 1]) {
        nums[write] = nums[read];
        write++;
    }
}
System.out.println(Arrays.toString(Arrays.copyOf(nums, write))); // [1, 2, 3, 4]
```

### Two arrays or strings at once: merge, and a subsequence

```java
int[] a = {1, 4, 7};
int[] b = {2, 3, 8, 9};
int[] out = new int[a.length + b.length];
int i = 0, j = 0, k = 0;
while (i < a.length && j < b.length) {
    out[k++] = a[i] <= b[j] ? a[i++] : b[j++];
}
while (i < a.length) out[k++] = a[i++];       // whatever is left
while (j < b.length) out[k++] = b[j++];
System.out.println(Arrays.toString(out)); // [1, 2, 3, 4, 7, 8, 9]

String s = "ace";
String t = "abcde";
int p = 0;
for (int q = 0; q < t.length() && p < s.length(); q++) {
    if (s.charAt(p) == t.charAt(q)) p++;      // matched the next letter of s
}
System.out.println(p == s.length());      // true, "ace" is a subsequence
```

### Fixed window: the best k in a row

```java
int[] nums = {2, 1, 5, 1, 3, 2};
int k = 3;
int window = 0;
for (int i = 0; i < k; i++) window += nums[i];
int best = window;
for (int right = k; right < nums.length; right++) {
    window += nums[right] - nums[right - k];   // add the one entering, drop the one leaving
    best = Math.max(best, window);
}
System.out.println(best); // 9, from 5 + 1 + 3
```

### Variable window: longest substring without repeats

Grow the right edge every step, and shrink the left edge while the window breaks the rule.

```java
import java.util.HashSet;
import java.util.Set;

String s = "abcabcbb";
Set<Character> window = new HashSet<>();
int left = 0;
int best = 0;
for (int right = 0; right < s.length(); right++) {
    char c = s.charAt(right);
    while (window.contains(c)) {
        window.remove(s.charAt(left++));     // shrink until the repeat is gone
    }
    window.add(c);
    best = Math.max(best, right - left + 1);
}
System.out.println(best); // 3, "abc"
```

With a last-seen map, the left edge jumps past the earlier copy in one step:

```java
import java.util.HashMap;
import java.util.Map;

String s = "pwwkew";
Map<Character, Integer> lastSeen = new HashMap<>();
int left = 0;
int best = 0;
for (int right = 0; right < s.length(); right++) {
    char c = s.charAt(right);
    if (lastSeen.containsKey(c) && lastSeen.get(c) >= left) {
        left = lastSeen.get(c) + 1;
    }
    lastSeen.put(c, right);
    best = Math.max(best, right - left + 1);
}
System.out.println(best); // 3, "wke"
```

### Variable window: shortest run with a sum of at least target

```java
int[] nums = {2, 3, 1, 2, 4, 3};
int target = 7;
int left = 0;
int sum = 0;
int best = Integer.MAX_VALUE;
for (int right = 0; right < nums.length; right++) {
    sum += nums[right];
    while (sum >= target) {
        best = Math.min(best, right - left + 1);
        sum -= nums[left++];
    }
}
System.out.println(best == Integer.MAX_VALUE ? 0 : best); // 2, from 4 + 3
```

### Letter counts in a window (anagrams)

```java
import java.util.ArrayList;
import java.util.List;

String s = "cbaebabacd";
String p = "abc";
int[] need = new int[26];
int[] have = new int[26];
for (char c : p.toCharArray()) need[c - 'a']++;   // 'a' is 0, 'z' is 25
List<Integer> starts = new ArrayList<>();
for (int right = 0; right < s.length(); right++) {
    have[s.charAt(right) - 'a']++;
    if (right >= p.length()) have[s.charAt(right - p.length()) - 'a']--;   // the letter that left
    if (Arrays.equals(have, need)) starts.add(right - p.length() + 1);
}
System.out.println(starts); // [0, 6]
```

### Prefix sums

`prefix[i]` is the sum of the first `i` values, so indexes `l` to `r` sum to `prefix[r + 1] - prefix[l]`.

```java
int[] nums = {3, 1, 4, 1, 5};
long[] prefix = new long[nums.length + 1];
for (int i = 0; i < nums.length; i++) prefix[i + 1] = prefix[i] + nums[i];
System.out.println(Arrays.toString(prefix)); // [0, 3, 4, 8, 9, 14]
System.out.println(prefix[4] - prefix[1]);   // 6, nums[1] + nums[2] + nums[3]
```

### Prefix sums with a map: subarrays that sum to k

Every earlier prefix equal to `sum - k` starts a subarray that ends here and sums to `k`.

```java
int[] nums = {1, 2, 1, 2, 1};
int k = 3;
Map<Integer, Integer> seen = new HashMap<>();
seen.put(0, 1);                                // the empty prefix
int sum = 0;
int count = 0;
for (int x : nums) {
    sum += x;
    count += seen.getOrDefault(sum - k, 0);
    seen.merge(sum, 1, Integer::sum);
}
System.out.println(count); // 4
```

### Prefix and suffix products

Product of the array except self, with no division: one pass leaves the product of everything to the left, a second pass from the right multiplies in everything to the right.

```java
int[] nums = {1, 2, 3, 4};
int[] out = new int[nums.length];
int before = 1;
for (int i = 0; i < nums.length; i++) {
    out[i] = before;                     // the product of everything to the left
    before *= nums[i];
}
int after = 1;
for (int i = nums.length - 1; i >= 0; i--) {
    out[i] *= after;                     // times everything to the right
    after *= nums[i];
}
System.out.println(Arrays.toString(out)); // [24, 12, 8, 6]
```

### Which pattern

| Pattern | Pointers | For |
| --- | --- | --- |
| both ends | `left = 0`, `right = n - 1`, move inward | pair sums on sorted data, palindromes |
| read and write | `write` trails `read` | removing or compacting in place |
| fixed window | `right` and `right - k` | sums or counts over every k in a row |
| variable window | grow `right`, shrink `left` in a `while` | the longest or shortest run that fits a rule |
| prefix sums | `prefix[r + 1] - prefix[l]` | range sums, and subarray sums with a map |

### Gotchas

- Shrink a variable window with `while`, not `if`. One new value can force several steps.
- Sums of many `int` values can pass 2,147,483,647. Use `long` for running sums and prefix arrays.
- `int n = seen.get(x);` throws `NullPointerException` for a missing key. Use `getOrDefault`.
- `lastSeen.get(a) == lastSeen.get(b)` compares two `Integer` objects and fails above 127. Use `equals`.
