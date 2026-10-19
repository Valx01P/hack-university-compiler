# Classes and Objects

A `class` bundles fields and methods, and `new` makes an instance. Fields live on `this`, and every method must use `this.` to reach them. For a one-off bag of data, a plain object literal `{}` is enough.

### Define and create

```javascript
class Point {
  constructor(x, y) {
    this.x = x;          // fields are created by assigning to this
    this.y = y;
  }

  dist(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  toString() {           // used by `${p}` and String(p)
    return `(${this.x}, ${this.y})`;
  }
}

const p = new Point(3, 4);
p.x;                     // 3
p.dist(new Point(0, 0)); // 5
`${p}`;                  // '(3, 4)'
console.log(p);          // Point { x: 3, y: 4 }
p instanceof Point;      // true
```

### Fields, private, getters, static

```javascript
class Account {
  static count = 0;      // one per class: Account.count
  #balance = 0;          // private: only code inside the class can see it
  history = [];          // public field with a starting value

  constructor(owner) {
    this.owner = owner;
    Account.count++;
  }

  deposit(amount) {
    if (amount <= 0) throw new RangeError("amount must be positive");
    this.#balance += amount;
    this.history.push(amount);
    return this;         // returning this lets calls chain
  }

  get balance() {        // read like a field: acct.balance
    return this.#balance;
  }

  static fromCsv(line) { // called on the class, not an instance
    const [owner, amount] = line.split(",");
    return new Account(owner).deposit(Number(amount));
  }
}

const acct = new Account("ann");
acct.deposit(50).deposit(25);
acct.balance;                        // 75
acct.balance = 999;                  // ignored, there is no setter
const bob = Account.fromCsv("bob,40");
Account.count;                       // 2
```

A setter pairs with a getter: `set balance(v) { ... }` runs on `acct.balance = v`.

### Use it in a loop

```javascript harness
class Account {
  #balance = 0;

  constructor(owner) {
    this.owner = owner;
  }

  deposit(amount) {
    this.#balance += amount;
    return this;
  }

  get balance() {
    return this.#balance;
  }
}

{{code}}
console.log(`total: ${total}`);
console.log(`richest: ${richest.owner}`);
```

```javascript
const accounts = [new Account("cy"), new Account("al")];
accounts[0].deposit(10);
accounts[1].deposit(30);

for (const a of accounts) {
  console.log(`${a.owner}: ${a.balance}`);   // cy: 10, al: 30
}
accounts.sort((a, b) => a.owner.localeCompare(b.owner));   // by owner
const total = accounts.reduce((sum, a) => sum + a.balance, 0);  // 40
const richest = accounts.reduce((best, a) => (a.balance > best.balance ? a : best));
```

### Object literals

```javascript
const user = {
  name: "ann",
  age: 31,
  greet() {
    return `hi, I'm ${this.name}`;
  },
};
user.greet();                      // "hi, I'm ann"
const older = { ...user, age: 32 };  // shallow copy with one field changed
```

| Call | Does |
| --- | --- |
| `new C(args)` | make an instance, runs `constructor` |
| `obj instanceof C` | `true` if `obj` was made by `C` or a subclass |
| `obj.constructor.name` | the class name as a string, `'Point'` |
| `Object.keys(obj)` | public field names (not methods, not `#private`) |
| `JSON.stringify(obj)` | public fields as JSON, methods and `#private` left out |
| `structuredClone(obj)` | deep copy of plain data (the copy loses its class) |

### Gotchas

- Forgetting `this.` inside a method reads a variable, not the field: `return x` is a ReferenceError or the wrong value.
- A method pulled off its object loses `this`: `const f = p.toString` then `f()` throws a TypeError. Call `p.toString()`, or pass `() => p.toString()` as a callback.
- `new Point(1, 2) === new Point(1, 2)` is `false`. Objects compare by reference, so write an `equals` method or compare fields.
- Calling a class without `new` throws: "Class constructor Point cannot be invoked without 'new'".
