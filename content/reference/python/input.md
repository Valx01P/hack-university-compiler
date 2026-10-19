# User Input

`input()` reads one line from standard input and returns it as a `str` without the newline. Convert it yourself with `int()`, `float()`, or `split()`. For many lines or big inputs, read `sys.stdin`.

### One value

```stdin
Ana
31
2.5
 Yes 
```

```python
name = input()                    # "Ana"
age = int(input())                # "31" -> 31
price = float(input())            # "2.5" -> 2.5
answer = input("Continue? ").strip().lower()   # prompt prints first
print(f"{name} is {age}, pays {price}, said {answer}")
```

### Several values on one line

```stdin
3 4
5 1 8
red green
x,y,z
```

```python
a, b = map(int, input().split())          # "3 4" -> 3, 4
nums = list(map(int, input().split()))    # "5 1 8" -> [5, 1, 8]
words = input().split()                   # "red green" -> ['red', 'green']
parts = input().split(",")                # "x,y,z" -> ['x', 'y', 'z']
print(a + b, sum(nums), words, parts)     # 7 14 ['red', 'green'] ['x', 'y', 'z']
```

### A count, then that many lines

```stdin
3
ana
bo
cy
```

```python
n = int(input())
names = [input().strip() for _ in range(n)]
print(names)                      # ['ana', 'bo', 'cy']
```

### Until end of input

```python
import sys

total = 0
for line in sys.stdin:            # stops at end of input
    line = line.strip()
    if not line:
        continue                  # skip blank lines
    total += int(line)
print(total)
```

All at once, which is the fastest way to read lots of numbers:

```stdin
3
5 1 8
```

```python
import sys

data = sys.stdin.read().split()   # every token, across all lines
n = int(data[0])
nums = list(map(int, data[1:1 + n]))
print(max(nums))
```

`input()` raises `EOFError` when there is nothing left to read. Catch it to loop on `input()` without knowing the count:

```python
lines = []
while True:
    try:
        lines.append(input())
    except EOFError:
        break
print(len(lines))
```

### Into a grid

```stdin
2 3
#.#
.#.
1 2 3
4 5 6
```

```python
rows, cols = map(int, input().split())
grid = [list(input()) for _ in range(rows)]      # "#.#" -> ['#', '.', '#']
walls = sum(row.count("#") for row in grid)
matrix = [list(map(int, input().split())) for _ in range(rows)]
print(walls, matrix[1][2])
```

### Into a dict, set, or objects

```stdin
3
apple 3
pear 1
apple 2
a b a c
```

```python
n = int(input())
stock = {}
for _ in range(n):
    item, qty = input().split()            # "apple 3"
    stock[item] = stock.get(item, 0) + int(qty)
print(stock)                               # {'apple': 5, 'pear': 1}

unique = set(input().split())              # "a b a c" -> {'a', 'b', 'c'}
print(len(unique))                         # 3
```

```stdin
3
ana 90
bo 85
cy 78
```

```python
class Student:
    def __init__(self, name, grade):
        self.name = name
        self.grade = grade

n = int(input())
students = []
for _ in range(n):
    name, grade = input().split()          # "ana 90"
    students.append(Student(name, int(grade)))
best = max(students, key=lambda s: s.grade)
print(best.name)
```

### Validate and retry

```stdin
abc
31
```

```python harness
{{code}}
print(age)
```

```python
while True:
    raw = input("Age: ")
    if raw.isdigit():
        age = int(raw)
        break
    print("Please enter a whole number.")
```

| Call | Does |
| --- | --- |
| `input()` | next line as str, `EOFError` at the end |
| `input().split()` | split on any whitespace |
| `map(int, parts)` | convert every token |
| `sys.stdin.readline()` | next line with its `\n`, `""` at the end |
| `sys.stdin.read()` | everything left as one str |
| `s.strip()` | drop spaces and the newline |

### Gotchas

- `input()` always returns a string: `input() + 1` is a `TypeError`. Convert first.
- `int("3.5")` and `int("")` raise `ValueError`. Use `float()` for decimals, and check for blank lines.
- `sys.stdin.readline()` keeps the trailing `\n`. Call `.strip()` before comparing.
- `input("Age: ")` prints the prompt to standard output. When the output is checked against an expected answer, call `input()` with no prompt.
