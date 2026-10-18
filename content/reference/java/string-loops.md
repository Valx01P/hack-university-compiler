# Looping Over Strings

Loop over a string by index with `charAt(i)`, or over `toCharArray()` with for-each. Each item is a `char`, a number underneath, so you can do math on it and compare it with `==`.

### By index

```java
String s = "hello";
for (int i = 0; i < s.length(); i++) {
    char c = s.charAt(i);
    System.out.print(i + ":" + c + " "); // 0:h 1:e 2:l 3:l 4:o
}
```

### For-each over the chars

```java
for (char c : s.toCharArray()) {
    System.out.print(c + "-"); // h-e-l-l-o-
}
```

### Reverse

```java
String rev = "";
for (int i = s.length() - 1; i >= 0; i--) {
    rev += s.charAt(i);           // fine for short strings
}
// rev is "olleh"

String rev2 = new StringBuilder(s).reverse().toString(); // "olleh", the quick way
```

### Count and test characters

```java
String text = "Hi 2 you!";
int letters = 0;
int digits = 0;
int vowels = 0;
for (char c : text.toCharArray()) {
    if (Character.isLetter(c)) letters++;
    if (Character.isDigit(c)) digits++;
    if ("aeiouAEIOU".indexOf(c) >= 0) vowels++;
}
System.out.println(letters + " " + digits + " " + vowels); // 5 1 3
```

### Char math

```java
char c = 'd';
int pos = c - 'a';                 // 3, position in the alphabet
char next = (char) (c + 1);        // 'e', cast back to char
int digit = '7' - '0';             // 7, digit char to int
char upper = Character.toUpperCase(c); // 'D'
```

### Count every letter

```java
int[] counts = new int[26];
for (char ch : "banana".toCharArray()) {
    counts[ch - 'a']++;
}
for (int i = 0; i < 26; i++) {
    if (counts[i] > 0) {
        System.out.print((char) ('a' + i) + "=" + counts[i] + " "); // a=3 b=1 n=2
    }
}
```

### Build a new string

```java
StringBuilder sb = new StringBuilder();
for (char ch : "Hello World".toCharArray()) {
    if (ch != 'o') {
        sb.append(Character.toUpperCase(ch));
    }
}
System.out.println(sb); // HELL WRLD
```

### Loop over words

```java
String line = "the quick  brown fox";
for (String word : line.split("\\s+")) {
    System.out.print(word.length() + " "); // 3 5 5 3
}
```

### Palindrome check with two pointers

```java
String w = "racecar";
boolean isPal = true;
int lo = 0;
int hi = w.length() - 1;
while (lo < hi) {
    if (w.charAt(lo) != w.charAt(hi)) {
        isPal = false;
        break;
    }
    lo++;
    hi--;
}
System.out.println(isPal); // true
```

### Character helpers

| Call | Does |
| --- | --- |
| `Character.isLetter(c)` | `a` to `z`, `A` to `Z` (and other alphabets) |
| `Character.isDigit(c)` | `0` to `9` |
| `Character.isLetterOrDigit(c)` | either one |
| `Character.isWhitespace(c)` | space, tab, newline |
| `Character.isUpperCase(c)` | uppercase letter |
| `Character.toUpperCase(c)` | uppercase copy of `c` |
| `Character.getNumericValue('7')` | `7` |

### Gotchas

- `c == "a"` does not compile, because a `char` is not a `String`. Compare with `'a'` in single quotes.
- `c + 1` is an `int`. Cast it back with `(char) (c + 1)`.
- `s += ch` in a long loop copies the whole string every pass. Use a `StringBuilder`.
- `s.charAt(s.length())` throws `StringIndexOutOfBoundsException`. The last index is `s.length() - 1`.
