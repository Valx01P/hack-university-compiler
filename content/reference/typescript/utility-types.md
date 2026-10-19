# Utility Types

Utility types are generic types built into TypeScript that make a new type from one you already have: optional, read-only, picked, filtered, or taken from a function. Deriving a type this way keeps it in step with the original, so the two never drift apart.

### Patch, complete, and freeze

`Partial<T>` makes every property optional, which is the type of a patch. `Required<T>` makes every one required, which is what you have after filling in defaults.

```typescript
type User = { id: number; name: string; email: string };

function updateUser(user: User, patch: Partial<User>): User {
  return { ...user, ...patch };
}

const ada: User = { id: 1, name: "Ada", email: "ada@example.com" };
console.log(updateUser(ada, { email: "ada@lovelace.dev" }).email); // ada@lovelace.dev

type Settings = { theme?: string; fontSize?: number };

function withDefaults(settings: Settings): Required<Settings> {
  return { theme: settings.theme ?? "light", fontSize: settings.fontSize ?? 16 };
}
console.log(withDefaults({ theme: "dark" })); // { theme: 'dark', fontSize: 16 }
```

`Readonly<T>` blocks assignment, at compile time only.

```typescript error
const config: Readonly<{ port: number }> = { port: 8080 };
config.port = 9090;
// TS2540: Cannot assign to 'port' because it is a read-only property.
```

### Pick, Omit, and Record

A create endpoint takes the entity without the fields the server fills in, and a list shows a few fields. `Record<K, V>` with a union of keys needs a value for every key (TS2741 otherwise).

```typescript
type User = { id: number; name: string; email: string; createdAt: string };
type NewUser = Omit<User, "id" | "createdAt">;
//   ^? type NewUser = { name: string; email: string; }
type UserSummary = Pick<User, "id" | "name">;
//   ^? type UserSummary = { id: number; name: string; }

function createUser(input: NewUser, id: number, now: string): User {
  return { ...input, id, createdAt: now };
}

const user = createUser({ name: "Ada", email: "ada@example.com" }, 1, "2026-10-01");
const summary: UserSummary = { id: user.id, name: user.name };
console.log(summary); // { id: 1, name: 'Ada' }

type Role = "admin" | "viewer";
const canDelete: Record<Role, boolean> = { admin: true, viewer: false };
console.log(canDelete.viewer); // false
```

### Filter a union

```typescript types
type Status = "pending" | "paid" | "shipped" | "delivered" | "cancelled";
type OpenStatus = Exclude<Status, "delivered" | "cancelled">;
//   ^? type OpenStatus = "paid" | "pending" | "shipped"

type UiEvent = { type: "click"; x: number } | { type: "key"; key: string };
type ClickEvent = Extract<UiEvent, { type: "click" }>;
//   ^? type ClickEvent = { type: "click"; x: number; }

type Name = NonNullable<string | null | undefined>;
//   ^? type Name = string
```

### Types from functions and classes

Derive a type from the function that already describes it. Write `typeof` before the function's name, since the function is a value.

```typescript
function loadConfig() {
  return { port: 8080, host: "localhost", debug: false };
}
type Config = ReturnType<typeof loadConfig>;
//   ^? type Config = { port: number; host: string; debug: boolean; }

function sendEmail(to: string, subject: string): string {
  return `${subject} -> ${to}`;
}
const args: Parameters<typeof sendEmail> = ["ada@example.com", "Invoice"];
console.log(sendEmail(...args)); // Invoice -> ada@example.com

async function fetchUser() {
  return { id: 1, name: "Ada" };
}
type FetchedUser = Awaited<ReturnType<typeof fetchUser>>;
//   ^? type FetchedUser = { id: number; name: string; }

class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const pointArgs: ConstructorParameters<typeof Point> = [3, 4];
const point: InstanceType<typeof Point> = new Point(...pointArgs);
console.log(point.x + point.y); // 7
```

### this and string helpers

`ThisParameterType` and `OmitThisParameter` read and remove a function's `this` parameter. The string helpers change the case of string literal types.

```typescript
interface Cart {
  items: number[];
}

function total(this: Cart, taxRate: number): number {
  return this.items.reduce((sum, n) => sum + n, 0) * (1 + taxRate);
}
type TotalThis = ThisParameterType<typeof total>;
//   ^? type TotalThis = Cart

const cartTotal: OmitThisParameter<typeof total> = total.bind({ items: [10, 20] });
console.log(cartTotal(0.5)); // 45

type Method = "get" | "post";
type Upper = Uppercase<Method>;
//   ^? type Upper = "GET" | "POST"
type Handler = `on${Capitalize<Method>}`;
//   ^? type Handler = "onGet" | "onPost"
```

| Utility | Example | Gives |
| --- | --- | --- |
| `Partial<T>` | `Partial<{ a: number; b: string }>` | `{ a?: number; b?: string; }` |
| `Required<T>` | `Required<{ a?: number }>` | `{ a: number; }` |
| `Readonly<T>` | `Readonly<{ a: number }>` | `{ readonly a: number; }` |
| `Record<K, V>` | `Record<"x" \| "y", number>` | `{ x: number; y: number; }` |
| `Pick<T, K>` | `Pick<{ a: number; b: string }, "a">` | `{ a: number; }` |
| `Omit<T, K>` | `Omit<{ a: number; b: string }, "a">` | `{ b: string; }` |
| `Exclude<U, E>` | `Exclude<"a" \| "b" \| "c", "a">` | `"b" \| "c"` |
| `Extract<U, E>` | `Extract<"a" \| 1 \| true, string>` | `"a"` |
| `NonNullable<T>` | `NonNullable<string \| null \| undefined>` | `string` |
| `Parameters<F>` | `Parameters<(id: number, name: string) => void>` | `[id: number, name: string]` |
| `ReturnType<F>` | `ReturnType<() => string[]>` | `string[]` |
| `Awaited<T>` | `Awaited<Promise<Promise<number>>>` | `number` |
| `ConstructorParameters<C>` | `ConstructorParameters<typeof Point>` | `[x: number, y: number]` |
| `InstanceType<C>` | `InstanceType<typeof Point>` | `Point` |
| `NoInfer<T>` | `(states: S[], initial: NoInfer<S>)` | `initial` is checked against `S` but doesn't decide it |
| `ThisParameterType<F>` | `ThisParameterType<typeof total>` | `Cart` |
| `OmitThisParameter<F>` | `OmitThisParameter<typeof total>` | `(taxRate: number) => number` |
| `ThisType<T>` | `methods: M & ThisType<State>` | `this` is `State` inside those methods |
| `Uppercase<S>` | `Uppercase<"get">` | `"GET"` |
| `Lowercase<S>` | `Lowercase<"GET">` | `"get"` |
| `Capitalize<S>` | `Capitalize<"name">` | `"Name"` |
| `Uncapitalize<S>` | `Uncapitalize<"Name">` | `"name"` |

### Gotchas

- `Omit` doesn't check its keys: `Omit<User, "emial">` compiles and removes nothing. `Pick<User, "emial">` is TS2344.
- `Omit` and `Pick` on a union keep only the keys every member shares: if every shape has `kind`, `id`, and its own sizes, `Omit<Shape, "id">` is just `{ kind: "circle" | "rect"; }`. Omit from each member instead, with `T extends unknown ? Omit<T, K> : never`.
- `Partial` and `Readonly` are shallow. A nested object stays required and mutable, and `Readonly` never stops a write at runtime (`Object.freeze` does).
- `ReturnType<loadConfig>` is TS2749: the function is a value, so write `ReturnType<typeof loadConfig>`.
