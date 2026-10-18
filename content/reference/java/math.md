# Math Operators

Java has `+ - * / %`. Dividing two integers truncates the result, and there is no `**` power operator: use `Math.pow`. The `Math` class is in `java.lang`, so no import is needed.

### Arithmetic

```java
int a = 17, b = 5;
int sum = a + b;                 // 22
int diff = a - b;                // 12
int prod = a * b;                // 85
int quot = a / b;                // 3, int / int drops the fraction
int rem = a % b;                 // 2
double exact = (double) a / b;   // 3.4
double half = a / 2.0;           // 8.5
int order = 2 + 3 * 4;           // 14, * / % before + -
```

### Negative numbers

```java
int q = -17 / 5;                 // -3, truncates toward zero
int r = -17 % 5;                 // -2, sign follows the left side
int m = Math.floorMod(-17, 5);   // 3, always 0 to 4 for a divisor of 5
int f = Math.floorDiv(-17, 5);   // -4, rounds down
```

### Compound assignment and ++

```java
int x = 10;
x += 5;   // 15
x -= 3;   // 12
x *= 2;   // 24
x /= 5;   // 4
x %= 3;   // 1
x++;      // 2
x--;      // 1

int i = 5;
int post = i++;   // post is 5, then i becomes 6
int pre = ++i;    // i becomes 7, then pre is 7
```

### Powers and rounding

There is no `**` operator. `Math.pow` returns a `double`, so cast it for an `int`. The rest of `Math` is in Math and Built-in Methods.

```java
int cube = (int) Math.pow(3, 3);                // 27
double root = Math.sqrt(2);                     // 1.4142135623730951
double avg = Math.round(7.456 * 100) / 100.0;   // 7.46, round to 2 places
```

### Overflow

```java
int big = Integer.MAX_VALUE;     // 2147483647
int wrapped = big + 1;           // -2147483648, wraps silently
long ok = big + 1L;              // 2147483648, a long operand makes it long math
long bad = big * 2;              // -2, the int multiply overflowed before widening
long good = (long) big * 2;      // 4294967294
Math.addExact(big, 1);           // throws ArithmeticException instead of wrapping
```

### Use it in a loop: / and % together

```java
for (int secs : new int[] {59, 61, 3725}) {
    int h = secs / 3600;
    int m = secs / 60 % 60;
    int s = secs % 60;
    System.out.printf("%d:%02d:%02d%n", h, m, s);
}
// 0:00:59
// 0:01:01
// 1:02:05
```

### Gotchas

- `7 / 2` is `3`. Make one side a `double` first: `7 / 2.0` or `(double) a / b`. Writing `(double) (a / b)` is too late, the division already truncated.
- `int` overflow wraps silently, and `long x = a * b` with two `int`s overflows before it widens. Write `(long) a * b`.
- `0.1 + 0.2` is `0.30000000000000004`. Compare doubles with a tolerance, and use `BigDecimal` for money.
- `^` is bitwise XOR, not power: `2 ^ 3` is `1`. Integer `x / 0` throws `ArithmeticException`, while `x / 0.0` gives `Infinity`.
