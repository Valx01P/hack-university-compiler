# If and Else

Python writes `if`, `elif`, `else` with a colon at the end and an indented block below. No parentheses around the condition and no braces.

### if, elif, else

```python
temp = 22
if temp > 30:
    print("hot")
elif temp > 15:
    print("warm")       # warm
else:
    print("cold")
```

Only the first true branch runs. `elif` and `else` are optional, and you can chain as many `elif` as you need.

### Nested, or flattened with and

```python
age, has_ticket = 20, True
if age >= 18:
    if has_ticket:
        print("enter")          # enter
    else:
        print("buy a ticket")

if age >= 18 and has_ticket:    # same check, one level
    print("enter")              # enter
```

### Empty block and one-liners

```python
x = 3
if x > 0:
    pass                        # placeholder, a block can't be empty
if x > 0: print("positive")     # legal, but keep it short
label = "pos" if x > 0 else "not pos"   # one-line choice, see Ternary
```

### Guard clauses

```python
def grade(score):
    if score < 0 or score > 100:
        return "invalid"
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    return "C"

print(grade(85))                # B
print(grade(120))               # invalid
```

### Use it in a loop

```python
for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)
```

### Check membership instead of chaining

```python
day = "sat"
if day in ("sat", "sun"):
    print("weekend")            # weekend
```

### Gotchas

- It's `elif`. `else if x:` on one line is a `SyntaxError`.
- Forgetting the colon, or mixing tabs and spaces, gives a `SyntaxError` or `IndentationError`. Indent with 4 spaces.
- `if x = 5:` is a `SyntaxError`. Comparison is `==`.
- Order matters: test `n % 15` before `n % 3`, or the narrower branch never runs.
