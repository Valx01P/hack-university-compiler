# Generics

A type parameter like `<T>` lets one function, type, or class work with many types and still connect them: the type that goes in decides the type that comes out. TypeScript infers `T` from the arguments, so you rarely write it at the call.

### Type parameters

```typescript
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const n = first([10, 20, 30]);
//    ^? const n: number | undefined
const s = first(["ada", "grace"]);
//    ^? const s: string | undefined
console.log(n, s); // 10 ada
```

Each type parameter is inferred on its own. When an argument can't tell TypeScript the type, like an empty array, pass the type argument yourself.

```typescript
function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b];
}
const p = pair("mug", 12.5);
//    ^? const p: [string, number]
console.log(p); // [ 'mug', 12.5 ]

function createList<T>(items: T[]): T[] {
  return items;
}
const empty = createList([]);
//    ^? const empty: never[]
const names = createList<string>([]);
names.push("Ada");
console.log(names); // [ 'Ada' ]
```

### Constraints

`T extends { length: number }` means any type with at least a numeric `length`. The body can use `length`, and the caller still gets their own type back.

```typescript
function longest<T extends { length: number }>(a: T, b: T): T {
  return b.length > a.length ? b : a;
}
console.log(longest("mug", "teapot"));   // teapot
console.log(longest([1, 2], [1, 2, 3])); // [ 1, 2, 3 ]

function byId<T extends { id: string }>(items: readonly T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
const products = [{ id: "p1", name: "Mug", priceCents: 1299 }];
const mug = byId(products, "p1");
//    ^? const mug: { id: string; name: string; priceCents: number; } | undefined
console.log(mug?.priceCents); // 1299
```

```typescript harness
function longest<T extends { length: number }>(a: T, b: T): T {
  return b.length > a.length ? b : a;
}

{{code}}
```

```typescript error
longest(10, 20);
// TS2345: Argument of type 'number' is not assignable to parameter of type '{ length: number; }'.
```

### keyof and indexed access

`keyof User` is the union of `User`'s keys, and `User["email"]` is the type of that property. Together they type a lookup exactly.

```typescript
type User = { id: number; name: string; email: string };

function getProp<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

function pluck<T, K extends keyof T>(rows: readonly T[], key: K): T[K][] {
  return rows.map((row) => row[key]);
}

const user: User = { id: 7, name: "Ada", email: "ada@example.com" };
const id = getProp(user, "id");
//    ^? const id: number
const emails = pluck([user], "email");
//    ^? const emails: string[]
console.log(id, emails); // 7 [ 'ada@example.com' ]
```

```typescript harness
type User = { id: number; name: string; email: string };

function getProp<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user: User = { id: 7, name: "Ada", email: "ada@example.com" };
{{code}}
```

```typescript error
getProp(user, "phone");
// TS2345: Argument of type '"phone"' is not assignable to parameter of type 'keyof User'.
```

### Defaults, const, and NoInfer

A default (`<T = unknown>`) fills in `T` when no type argument is given. A `const` type parameter keeps the literal types of what the caller passes.

```typescript
type ApiResponse<T = unknown> = { status: number; data: T };
type Untyped = ApiResponse;
//   ^? type Untyped = { status: number; data: unknown; }

function routes<const T extends readonly string[]>(paths: T): T {
  return paths;
}
const paths = routes(["/", "/about"]);
//    ^? const paths: readonly ["/", "/about"]
console.log(paths.join(" ")); // / /about
```

Without `const`, the same call infers `string[]`. `NoInfer` marks a parameter that is checked against `T` but never helps decide it, so a typo can't widen the type.

```typescript
function createMachine<S extends string>(states: readonly S[], initial: NoInfer<S>) {
  return { states, current: initial };
}
const machine = createMachine(["idle", "running"], "idle");
//    ^? const machine: { states: readonly ("idle" | "running")[]; current: "idle" | "running"; }
console.log(machine.current); // idle
```

```typescript harness
function createMachine<S extends string>(states: readonly S[], initial: NoInfer<S>) {
  return { states, current: initial };
}

{{code}}
```

```typescript error
createMachine(["idle", "running"], "paused");
// TS2345: Argument of type '"paused"' is not assignable to parameter of type '"idle" | "running"'.
```

### Generic types and interfaces

```typescript
type Page<T> = { items: T[]; nextCursor: string | null };

interface Repository<T> {
  get(id: string): T | undefined;
  list(): T[];
}

type Note = { id: string; text: string };
const page: Page<Note> = { items: [{ id: "n1", text: "Buy milk" }], nextCursor: null };
const notes: Repository<Note> = {
  get: (id) => page.items.find((note) => note.id === id),
  list: () => page.items,
};
console.log(notes.get("n1")?.text); // Buy milk
console.log(notes.list().length);   // 1
```

### Generic classes

```typescript
class Stack<T> {
  #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  pop(): T | undefined {
    return this.#items.pop();
  }

  get size(): number {
    return this.#items.length;
  }
}

const stack = new Stack<number>();
stack.push(1);
stack.push(2);
console.log(stack.pop()); // 2
console.log(stack.size);  // 1
```

`stack.push("3")` is TS2345. The built-in containers work the same way: `Map<string, number[]>`, `Set<string>`, `Promise<User>`, and `Array<T>`, which is `T[]`.

| Syntax | Means |
| --- | --- |
| `function f<T>(x: T): T` | a type parameter, inferred from the argument |
| `f<string>(x)` | pass the type argument yourself |
| `<T extends { id: string }>` | `T` must have at least `id: string` |
| `<K extends keyof T>` | `K` is one of `T`'s keys |
| `T[K]` | the type of property `K` of `T` |
| `<T = unknown>` | the type to use when none is given |
| `<const T extends readonly string[]>` | infer literal types, as if the caller wrote `as const` |
| `NoInfer<T>` | check against `T` without inferring `T` from here |
| `class Stack<T>`, `interface Repository<T>` | generic classes and interfaces |

### Gotchas

- A type parameter used once connects nothing: `function log<T>(value: T): void` is the same as `(value: unknown)`. Use one when it links an argument to the result or to another argument.
- `function f<T extends string>(x: T): T { return "a"; }` is TS2322. `"a"` is a string, but `T` could be a narrower one.
- Type arguments are all or nothing: `pair<string>("a", 1)` is TS2558, "Expected 2 type arguments, but got 1."
- An empty array argument infers `never[]`, and nothing can be added to it. Pass the type argument, as in `createList<string>([])`.
