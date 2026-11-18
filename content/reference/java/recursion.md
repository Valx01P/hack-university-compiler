# Recursion and Backtracking

A recursive method calls itself on a smaller input until it reaches a base case. Backtracking is recursion over choices: choose, explore, then undo the choice so the next branch starts clean. Java's stack holds a few thousand frames, so keep the depth well under that.

### Base case and recursive case

```java
static long factorial(int n) {
    if (n <= 1) {
        return 1;                      // base case
    }
    return n * factorial(n - 1);       // a smaller input
}

static int digitSum(int n) {
    return n < 10 ? n : n % 10 + digitSum(n / 10);
}

System.out.println(factorial(10));     // 3628800
System.out.println(digitSum(9045));    // 18
```

### A helper that carries indexes

```java
public static boolean isPalindrome(String s) {
    return isPalindrome(s, 0, s.length() - 1);   // the caller never sees the indexes
}

private static boolean isPalindrome(String s, int i, int j) {
    if (i >= j) {
        return true;
    }
    return s.charAt(i) == s.charAt(j) && isPalindrome(s, i + 1, j - 1);
}

System.out.println(isPalindrome("racecar")); // true
System.out.println(isPalindrome("rocket"));  // false
```

### Subsets: take it or leave it

```java
import java.util.ArrayList;
import java.util.List;

static void subsets(int[] nums, int i, List<Integer> path, List<List<Integer>> out) {
    if (i == nums.length) {
        out.add(new ArrayList<>(path));   // save a copy, not path itself
        return;
    }
    path.add(nums[i]);                    // choose
    subsets(nums, i + 1, path, out);      // explore with it
    path.remove(path.size() - 1);         // undo
    subsets(nums, i + 1, path, out);      // explore without it
}

List<List<Integer>> out = new ArrayList<>();
subsets(new int[]{1, 2, 3}, 0, new ArrayList<>(), out);
System.out.println(out); // [[1, 2, 3], [1, 2], [1, 3], [1], [2, 3], [2], [3], []]
```

### Combinations: a start index

Each call tries every item after `start`, so no group repeats in another order. Stop at size k.

```java
static void combine(int[] nums, int start, int k, List<Integer> path, List<List<Integer>> out) {
    if (path.size() == k) {
        out.add(new ArrayList<>(path));
        return;
    }
    for (int i = start; i < nums.length; i++) {
        path.add(nums[i]);
        combine(nums, i + 1, k, path, out);   // i + 1: each item at most once
        path.remove(path.size() - 1);
    }
}

List<List<Integer>> pairs = new ArrayList<>();
combine(new int[]{1, 2, 3, 4}, 0, 2, new ArrayList<>(), pairs);
System.out.println(pairs); // [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]
```

### Permutations: a used array

```java
import java.util.Arrays;

static void permute(int[] nums, boolean[] used, List<Integer> path, List<List<Integer>> out) {
    if (path.size() == nums.length) {
        out.add(new ArrayList<>(path));
        return;
    }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) {
            continue;
        }
        used[i] = true;                   // choose
        path.add(nums[i]);
        permute(nums, used, path, out);   // explore
        path.remove(path.size() - 1);     // undo both
        used[i] = false;
    }
}

int[] nums = {3, 1, 2};
Arrays.sort(nums);                        // sorted input gives lexicographic output
List<List<Integer>> perms = new ArrayList<>();
permute(nums, new boolean[nums.length], new ArrayList<>(), perms);
System.out.println(perms); // [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
```

### Combination sum: reuse and a running total

```java
static void combinationSum(int[] cands, int start, int remaining, List<Integer> path, List<List<Integer>> out) {
    if (remaining == 0) {
        out.add(new ArrayList<>(path));
        return;
    }
    for (int i = start; i < cands.length && cands[i] <= remaining; i++) {
        path.add(cands[i]);
        combinationSum(cands, i, remaining - cands[i], path, out); // i, not i + 1: reuse it
        path.remove(path.size() - 1);
    }
}

int[] cands = {2, 3, 6, 7};               // sorted, so the loop can stop early
List<List<Integer>> sums = new ArrayList<>();
combinationSum(cands, 0, 7, new ArrayList<>(), sums);
System.out.println(sums); // [[2, 2, 3], [7]]
```

### N-Queens: columns and diagonals

Cells on one diagonal share `row - col`, and cells on one anti-diagonal share `row + col`, so three `boolean[]` arrays say whether a square is attacked.

```java
static int queens(int row, int n, boolean[] cols, boolean[] diag, boolean[] anti) {
    if (row == n) {
        return 1;                         // a queen in every row
    }
    int count = 0;
    for (int c = 0; c < n; c++) {
        int d = row - c + n - 1;          // shifted to 0 to 2n - 2
        if (cols[c] || diag[d] || anti[row + c]) {
            continue;
        }
        cols[c] = diag[d] = anti[row + c] = true;
        count += queens(row + 1, n, cols, diag, anti);
        cols[c] = diag[d] = anti[row + c] = false;
    }
    return count;
}

int n = 6;
System.out.println(queens(0, n, new boolean[n], new boolean[2 * n - 1], new boolean[2 * n - 1])); // 4
```

### Sort the results

Sort subsets by size, then value by value. A `List` has no natural order, so write the comparator.

```java
import java.util.Comparator;

Comparator<List<Integer>> bySizeThenValues = (a, b) -> {
    if (a.size() != b.size()) {
        return Integer.compare(a.size(), b.size());
    }
    for (int i = 0; i < a.size(); i++) {
        int c = Integer.compare(a.get(i), b.get(i));
        if (c != 0) {
            return c;
        }
    }
    return 0;
};
List<List<Integer>> subs = new ArrayList<>(List.of(List.of(2), List.of(1, 3), List.of(), List.of(1, 2)));
subs.sort(bySizeThenValues);
System.out.println(subs); // [[], [2], [1, 2], [1, 3]]
```

### Gotchas

- `out.add(path)` stores the one shared list, which is empty again when the search ends. Add `new ArrayList<>(path)`.
- `path.remove(path.size() - 1)` removes by index, as you want. But `path.remove(x)` with an `int x` also removes by index, not the value. Write `path.remove(Integer.valueOf(x))` for the value.
- Undo every part of a choice (`used[i] = false` as well as the `path`), or later branches see stale state.
- Deep recursion throws `StackOverflowError`. A simple method gets about 10,000 levels deep here, so loop instead on long inputs.
