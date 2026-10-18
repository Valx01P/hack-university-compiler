# Looping Over Arrays

Use an index loop when you need the position or want to write into the array. Use for-each when you only read the values. Both work the same on arrays and on an `ArrayList`.

### Index loop

```java
int[] nums = {4, 8, 15, 16};
for (int i = 0; i < nums.length; i++) {
    System.out.println(i + ": " + nums[i]); // 0: 4, 1: 8, 2: 15, 3: 16
}
```

### For-each

```java
int sum = 0;
for (int n : nums) {
    sum += n;
}
System.out.println(sum); // 43
```

### While with an index

```java
int i = 0;
while (i < nums.length && nums[i] < 10) {
    i++;
}
System.out.println(i); // 2, the index of the first value >= 10
```

### Change the values

```java
for (int j = 0; j < nums.length; j++) {
    nums[j] *= 2;           // nums is now [8, 16, 30, 32]
}

for (int n : nums) {
    n = 0;                  // changes the copy n only, nums is untouched
}
```

### ArrayList

```java
import java.util.ArrayList;
import java.util.List;

List<String> names = new ArrayList<>(List.of("Ana", "Bo", "Cy"));

for (int k = 0; k < names.size(); k++) {
    System.out.println(k + " " + names.get(k)); // 0 Ana, 1 Bo, 2 Cy
}
for (String name : names) {
    System.out.println(name);
}
names.forEach(System.out::println);           // same, with a method reference

names.removeIf(name -> name.startsWith("B")); // [Ana, Cy], safe removal
```

### Common jobs

```java
int[] data = {7, -2, 9, 4, 9};

int max = data[0];                    // start at the first value, not 0
for (int v : data) {
    if (v > max) max = v;
}                                     // max == 9

int found = -1;
for (int k = 0; k < data.length; k++) {
    if (data[k] == 9) {
        found = k;
        break;                        // stop at the first match
    }
}                                     // found == 2

int positives = 0;
for (int v : data) {
    if (v > 0) positives++;
}                                     // positives == 4
```

### Build a new array

```java
import java.util.Arrays;

int[] src = {1, 2, 3};
int[] doubled = new int[src.length];
for (int k = 0; k < src.length; k++) {
    doubled[k] = src[k] * 2;
}
System.out.println(Arrays.toString(doubled)); // [2, 4, 6]
```

### Which loop

| You need | Use |
| --- | --- |
| every value, read only | `for (int v : arr)` |
| the index too | `for (int i = 0; i < arr.length; i++)` |
| to change values in place | index loop, `arr[i] = ...` |
| to stop on a condition | `while` or `break` |
| to remove from an `ArrayList` | `list.removeIf(...)` or an `Iterator` |

### Gotchas

- `i <= arr.length` reads one past the end and throws `ArrayIndexOutOfBoundsException`.
- Calling `list.remove(...)` inside a for-each over that list throws `ConcurrentModificationException`.
- Starting `max` at `0` is wrong when every value is negative. Start at `arr[0]` or `Integer.MIN_VALUE`.
