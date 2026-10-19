# Classes

A TypeScript class is a JavaScript class with typed fields, plus checks like `private`, `readonly`, `implements`, and `abstract` that only `tsc` enforces. Declare every field with its type, since parameter properties (`constructor(private x: number)`) generate code that Node can't strip.

### Fields and constructors

Every field needs a value from its declaration or from the constructor, or `tsc` reports TS2564. `readonly` fields can only be set there.

```typescript
class BankAccount {
  readonly id: string;
  owner: string;
  balance = 0;

  constructor(id: string, owner: string) {
    this.id = id;
    this.owner = owner;
  }

  deposit(amount: number): number {
    this.balance += amount;
    return this.balance;
  }
}

const account = new BankAccount("acc_1", "Ada");
console.log(account.deposit(50)); // 50
console.log(account);             // BankAccount { id: 'acc_1', owner: 'Ada', balance: 50 }
```

```typescript error
class Profile {
  readonly id: string;
  bio: string;
  // TS2564: Property 'bio' has no initializer and is not definitely assigned in the constructor.

  constructor(id: string) {
    this.id = id;
  }
}

const profile = new Profile("p1");
profile.id = "p2";
// TS2540: Cannot assign to 'id' because it is a read-only property.
```

### Fields instead of parameter properties

A parameter property declares and assigns a field in one go, which is code Node can't strip. Write the field and the assignment.

```typescript error
class Product {
  constructor(public name: string, public priceCents: number) {}
}
// TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

```typescript
class Product {
  name: string;
  priceCents: number;

  constructor(name: string, priceCents: number) {
    this.name = name;
    this.priceCents = priceCents;
  }
}

console.log(new Product("Mug", 1299)); // Product { name: 'Mug', priceCents: 1299 }
```

### private and #private

`private` is a compile-time rule, and the field is still there at runtime. A `#` field is private in JavaScript itself.

```typescript
class Account {
  private pin = "1234";
  #balance = 100;

  get balance(): number {
    return this.#balance;
  }
}

const account = new Account();
console.log(Object.keys(account));    // [ 'pin' ]
console.log(JSON.stringify(account)); // {"pin":"1234"}
console.log(account.balance);         // 100
```

```typescript harness
class Account {
  private pin = "1234";
  #balance = 100;
}

const account = new Account();
{{code}}
```

```typescript error
console.log(account.pin);
// TS2341: Property 'pin' is private and only accessible within class 'Account'.
console.log(account.#balance);
// TS18013: Property '#balance' is not accessible outside class 'Account' because it has a private identifier.
```

### Getters, setters, and static members

A getter reads like a property, and a setter can validate. `static` members belong to the class, and a static factory is the place to check untyped input.

```typescript
class Temperature {
  static readonly absoluteZero = -273.15;
  #celsius = 0;

  get celsius(): number {
    return this.#celsius;
  }

  set celsius(value: number) {
    if (value < Temperature.absoluteZero) throw new RangeError(`below absolute zero: ${value}`);
    this.#celsius = value;
  }

  get fahrenheit(): number {
    return (this.#celsius * 9) / 5 + 32;
  }

  static fromJSON(json: unknown): Temperature {
    const t = new Temperature();
    if (typeof json === "object" && json !== null && "celsius" in json && typeof json.celsius === "number") {
      t.celsius = json.celsius;
    }
    return t;
  }
}

const t = Temperature.fromJSON(JSON.parse('{"celsius": 100}'));
console.log(t.fahrenheit); // 212
try {
  t.celsius = -300;
} catch (err) {
  console.log(err instanceof RangeError ? err.message : "?"); // below absolute zero: -300
}
```

### implements and abstract

`implements` checks that a class has an interface's shape (TS2420 when it doesn't) and adds no code. An `abstract` class shares code and leaves `abstract` members for subclasses, and creating one directly is TS2511.

```typescript
interface Notifier {
  send(to: string, message: string): string;
}

class EmailNotifier implements Notifier {
  send(to: string, message: string): string {
    return `email to ${to}: ${message}`;
  }
}

abstract class Report {
  abstract title: string;
  abstract rows(): string[];

  render(): string {
    return `${this.title}: ${this.rows().join(", ")}`;
  }
}

class SalesReport extends Report {
  title = "Sales";

  rows(): string[] {
    return ["Mug 3", "Tea 5"];
  }
}

const notifiers: Notifier[] = [new EmailNotifier(), { send: (to, message) => `sms to ${to}: ${message}` }];
for (const n of notifiers) console.log(n.send("Ada", "hi"));
// email to Ada: hi
// sms to Ada: hi
console.log(new SalesReport().render()); // Sales: Mug 3, Tea 5
```

Any object of the right shape is a `Notifier`, like the object literal above.

### override and protected

`override` marks a method that replaces one from the base class. The course config turns on `noImplicitOverride`, so leaving it out is TS4114, and `override` on a method the base doesn't have is TS4113. A `protected` member, like `label` here, is visible to subclasses, and reading it from outside is TS2445.

```typescript
class Shape {
  protected label = "shape";

  area(): number {
    return 0;
  }

  describe(): string {
    return `${this.label}, area ${this.area().toFixed(2)}`;
  }
}

class Circle extends Shape {
  radius: number;

  constructor(radius: number) {
    super();
    this.radius = radius;
    this.label = "circle";
  }

  override area(): number {
    return Math.PI * this.radius ** 2;
  }
}

const shapes: Shape[] = [new Circle(1), new Shape()];
for (const shape of shapes) console.log(shape.describe());
// circle, area 3.14
// shape, area 0.00
```

| Member | Means | Checked by |
| --- | --- | --- |
| `x: number` | a field, set in its declaration or the constructor | `tsc` (TS2564) |
| `readonly x` | set only in its declaration or the constructor | `tsc` (TS2540) |
| `private x` | only this class's code uses it, though it exists at runtime | `tsc` (TS2341) |
| `#x` | hidden from all other code, `Object.keys`, and `JSON.stringify` | JavaScript |
| `protected x` | this class and its subclasses | `tsc` (TS2445) |
| `static x` | on the class itself: `Temperature.absoluteZero` | both |
| `get x()`, `set x(v)` | a property that runs code | both |
| `abstract x` | subclasses must provide it, and the class can't be created | `tsc` (TS2511) |
| `override x()` | replaces a base class method | `tsc` (TS4114, TS4113) |
| `implements I` | the class has `I`'s shape | `tsc` (TS2420) |

### Gotchas

- `private` hides nothing at runtime: `JSON.stringify` and `Object.keys` still show the field. Use a `#` field when it must stay private.
- `implements` doesn't type a method's parameters. `send(to, message)` in a class that implements `Notifier` is TS7006, so annotate them.
- Decorators type-check, but Node 26 can't run them (`SyntaxError: Invalid or unexpected token`). Projects that use them, like Angular and NestJS, run through a compiler.
- A method pulled off its object loses `this`: `const deposit = account.deposit` compiles, then `deposit(10)` throws a TypeError. Pass `(n) => account.deposit(n)` instead.
