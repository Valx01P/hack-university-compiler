# Math Operators

Java has `+ - * / %`. Dividing two integers truncates the result, and there is no `**` power operator: use `Math.pow`. The `Math` class is in `java.lang`, so no import is needed.

### Arithmetic

```java
int a = 17, b = 5;
System.out.println(a + b);            // 22
System.out.println(a - b);            // 12
System.out.println(a * b);            // 85
System.out.println(a / b);            // 3, int / int drops the fraction
System.out.println(a % b);            // 2
System.out.println((double) a / b);   // 3.4
System.out.println(a / 2.0);          // 8.5
System.out.println(2 + 3 * 4);        // 14, * / % before + -
```

### Negative numbers

```java
System.out.println(-17 / 5);                 // -3, truncates toward zero
System.out.println(-17 % 5);                 // -2, sign follows the left side
System.out.println(Math.floorMod(-17, 5));   // 3, always 0 to 4 for a divisor of 5
System.out.println(Math.floorDiv(-17, 5));   // -4, rounds down
```

### Compound assignment and ++

```java
int x = 10;
x += 5;
System.out.println(x);   // 15
x -= 3;
System.out.println(x);   // 12
x *= 2;
System.out.println(x);   // 24
x /= 5;
System.out.println(x);   // 4
x %= 3;
System.out.println(x);   // 1
x++;
System.out.println(x);   // 2
x--;
System.out.println(x);   // 1

int i = 5;
int post = i++;                       // post is 5, then i becomes 6
System.out.println(post + " " + i);   // 5 6
int pre = ++i;                        // i becomes 7, then pre is 7
System.out.println(pre + " " + i);    // 7 7
```

### Powers and rounding

There is no `**` operator. `Math.pow` returns a `double`, so cast it for an `int`. The rest of `Math` is in Math and Built-in Methods.

```java
System.out.println((int) Math.pow(3, 3));              // 27
System.out.println(Math.sqrt(2));                      // 1.4142135623730951
System.out.println(Math.round(7.456 * 100) / 100.0);   // 7.46, round to 2 places
```

### Overflow

```java error
int big = Integer.MAX_VALUE;     // 2147483647
int wrapped = big + 1;           // -2147483648, wraps silently
long ok = big + 1L;              // 2147483648, a long operand makes it long math
long bad = big * 2;              // -2, the int multiply overflowed before widening
long good = (long) big * 2;      // 4294967294
Math.addExact(big, 1);           // throws ArithmeticException instead of wrapping
```

Catch it when you'd rather know than wrap:

```java
try {
    Math.addExact(Integer.MAX_VALUE, 1);
} catch (ArithmeticException e) {
    System.out.println(e.getMessage());                      // integer overflow
}
System.out.println(Math.multiplyExact(100_000L, 100_000L)); // 10000000000, fits a long
```

### GCD and LCM (Euclid)

```java
static int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

System.out.println(gcd(48, 18));            // 6
System.out.println(48 / gcd(48, 18) * 18);  // 144, the lcm, dividing first keeps it small
```

### Fast power with a modulus

Square the base and halve the exponent, so an exponent of 10^18 takes about 60 steps. Keep the products in `long` and take `% mod` after every multiply.

```java
static long powMod(long base, long exp, long mod) {
    long result = 1;
    base %= mod;
    while (exp > 0) {
        if ((exp & 1) == 1) {
            result = result * base % mod;
        }
        base = base * base % mod;
        exp >>= 1;
    }
    return result;
}

System.out.println(powMod(2, 10, 1_000_000_007));   // 1024
System.out.println(powMod(2, 100, 1_000_000_007));  // 976371285
```

### Primes: a sieve

```java
import java.util.ArrayList;
import java.util.List;

int n = 30;
boolean[] composite = new boolean[n + 1];
List<Integer> primes = new ArrayList<>();
for (int i = 2; i <= n; i++) {
    if (!composite[i]) {
        primes.add(i);
        for (long j = (long) i * i; j <= n; j += i) {
            composite[(int) j] = true;   // smaller multiples are marked already
        }
    }
}
System.out.println(primes); // [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
```

### Digits with % and /

`x % 10` is the last digit and `x / 10` drops it. Build the reverse in a `long`, then check it against the `int` range.

```java
static int reverse(int x) {
    long r = 0;
    while (x != 0) {
        r = r * 10 + x % 10;             // the digit keeps x's sign
        x /= 10;
    }
    if (r > Integer.MAX_VALUE || r < Integer.MIN_VALUE) {
        return 0;
    }
    return (int) r;
}

System.out.println(reverse(-123));       // -321
System.out.println(reverse(1534236469)); // 0, since 9646324351 doesn't fit an int
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
