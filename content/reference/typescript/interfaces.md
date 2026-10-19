# Interfaces and Type Aliases

`interface` and `type` both name an object shape, and for objects either one works. Interfaces can extend and merge, while only a `type` alias can name a union, a tuple, or a type computed from others.

### Declare an interface

```typescript
interface User {
  readonly id: number;
  name: string;
  email?: string;
  greet(): string;
}

const ada: User = {
  id: 1,
  name: "Ada",
  greet() {
    return `Hi, I'm ${this.name}`;
  },
};
console.log(ada.greet(), ada.email ?? "(no email)"); // Hi, I'm Ada (no email)
```

The same shape as a type alias is `type User = { readonly id: number; name: string; email?: string; greet(): string }`.

### extends

`extends` adds members to one or more existing interfaces.

```typescript
interface Animal {
  name: string;
}
interface Dog extends Animal {
  breed: string;
}
interface Auditable {
  createdBy: string;
}
interface ServiceDog extends Dog, Auditable {
  task: string;
}

const rex: ServiceDog = { name: "Rex", breed: "Labrador", createdBy: "ana", task: "guide" };
console.log(`${rex.name} the ${rex.breed}, ${rex.task} dog`); // Rex the Labrador, guide dog
```

A member that conflicts with the base is an error right where you declare it.

```typescript error
interface Base {
  id: string;
}
interface Item extends Base { // TS2430: Interface 'Item' incorrectly extends interface 'Base'.
  id: number;
}
```

### Intersections

`A & B` has every member of both. It is how type aliases combine shapes.

```typescript
type Timestamped = { createdAt: string; updatedAt: string };
type Draft = { title: string; body: string };
type Post = Draft & Timestamped;

const post: Post = { title: "Hello", body: "First post", createdAt: "2026-10-01", updatedAt: "2026-10-02" };
console.log(`${post.title}, updated ${post.updatedAt}`); // Hello, updated 2026-10-02

type NewTask = { title: string };
type Task = NewTask & { id: number; done: boolean };
const task: Task = { id: 1, title: "Write tests", done: false };
console.log(task); // { id: 1, title: 'Write tests', done: false }
```

When two members conflict, an intersection reports nothing at first: the property becomes `never`, and no value fits.

```typescript error
type Bad = { id: string } & { id: number };
const b: Bad = { id: "1" }; // TS2322: Type 'string' is not assignable to type 'never'.
```

### Declaration merging

Two `interface` declarations with the same name merge into one. That is how `.d.ts` files add members to a library's types. Two `type` aliases with the same name are an error.

```typescript
interface Settings {
  theme: string;
}
interface Settings {
  fontSize: number;
}
const settings: Settings = { theme: "dark", fontSize: 14 };
console.log(settings); // { theme: 'dark', fontSize: 14 }
```

```typescript error
type Settings = { theme: string };    // TS2300: Duplicate identifier 'Settings'.
type Settings = { fontSize: number }; // TS2300: Duplicate identifier 'Settings'.
```

### implements

`implements` checks that a class has every member of an interface (or of an object type alias). It adds no code, and any object of the right shape fits the interface too.

```typescript
interface Notifier {
  send(to: string, message: string): string;
}
class EmailNotifier implements Notifier {
  send(to: string, message: string): string {
    return `email to ${to}: ${message}`;
  }
}
const sms: Notifier = { send: (to, message) => `sms to ${to}: ${message}` };

for (const notifier of [new EmailNotifier(), sms]) {
  console.log(notifier.send("ada", "Hi")); // email to ada: Hi, then sms to ada: Hi
}
```

```typescript error
interface Notifier {
  send(to: string, message: string): string;
}
class SmsNotifier implements Notifier {} // TS2420: Class 'SmsNotifier' incorrectly implements interface 'Notifier'.
```

### Which to use

| You are naming | Use |
| --- | --- |
| an object shape | either: many teams pick `interface` |
| a union, like `"pending" \| "paid"` | `type` |
| a tuple, like `[lat: number, lng: number]` | `type` |
| a function type, like `(n: number) => string` | `type` (an interface needs a call signature) |
| a type built from others: `Pick<User, "id">`, `keyof typeof X` | `type` |
| a contract that classes `implements` | `interface`, or a `type` of an object shape |
| extra members for a library's type | `interface`, which merges |

The common convention mixes them: unions as `type`, object shapes as `interface`.

```typescript
type OrderStatus = "pending" | "paid" | "shipped";

interface Order {
  id: string;
  status: OrderStatus;
  totalCents: number;
}
interface ShippedOrder extends Order {
  status: "shipped";
  trackingNumber: string;
}

const order: ShippedOrder = { id: "o1", status: "shipped", totalCents: 2599, trackingNumber: "1Z999" };
console.log(`${order.id} ${order.status} ${order.trackingNumber}`); // o1 shipped 1Z999
```

### Gotchas

- An intersection of conflicting members compiles until you use it, while `interface ... extends` reports the conflict at once (TS2430).
- `implements` doesn't give a method's parameters their types. `send(to, message)` in the class is still TS7006, so write the types again.
- Two `interface` declarations with the same name merge silently, so reusing a name by accident adds members instead of failing.
- An interface can't be a union. `type Shape = Circle | Square` has to be a type alias.
