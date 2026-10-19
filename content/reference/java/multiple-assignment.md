# Multiple Assignment

Java has no tuple unpacking like `a, b = 1, 2`. You can declare several variables of one type on one line, chain `=` to give them the same value, and swap with a temporary variable.

### Several declarations on one line

```java
int x = 1, y = 2, z = 3;
String first = "Ada", last = "Lovelace";
double w, h;      // both declared, neither assigned
System.out.println(x + " " + y + " " + z);  // 1 2 3
```

### Same value to many (chained)

`=` is an expression that returns the assigned value, so assignments chain right to left. The variables must already be declared.

```java
int a, b, c;
a = b = c = 10;
System.out.println(a + " " + b + " " + c);  // 10 10 10
```

### Swap two variables

```java
int left = 1, right = 2;
int tmp = left;
left = right;
right = tmp;
System.out.println(left + " " + right);  // 2 1
```

Swap two array elements the same way:

```java
int[] arr = {5, 8};
int t = arr[0];
arr[0] = arr[1];
arr[1] = t;
System.out.println(Arrays.toString(arr));  // [8, 5]
```

### Return several values

A method returns one value. Return an array when the values share a type.

```java
static int[] minMax(int[] nums) {
    int lo = nums[0], hi = nums[0];
    for (int n : nums) {
        lo = Math.min(lo, n);
        hi = Math.max(hi, n);
    }
    return new int[] {lo, hi};
}

int[] r = minMax(new int[] {4, 9, 1});
int lo = r[0], hi = r[1];            // unpack by index
System.out.println(lo + " " + hi);   // 1 9
```

For values of different types, return a pair or a small class (see Tuples and Pairs).

### Use it in a loop

A `for` header can declare and update several variables of one type, separated by commas.

```java
for (int i = 0, j = 4; i < j; i++, j--) {
    System.out.print(i + "-" + j + " ");
}
// 0-4 1-3
```

Updating two values at once (Fibonacci) needs a temporary:

```java
int prev = 0, curr = 1;
for (int i = 0; i < 7; i++) {
    System.out.print(prev + " ");
    int next = prev + curr;
    prev = curr;
    curr = next;
}
// 0 1 1 2 3 5 8
```

### Gotchas

- `int a, b = 5;` only assigns `b`. `a` is declared but has no value.
- `int a = b = 5;` does not compile unless `b` was declared earlier.
- `var a = 1, b = 2;` does not compile. `var` declares one variable at a time.
- A method can't swap the caller's variables. Java passes copies of primitives, so swap in place or return the new values.
