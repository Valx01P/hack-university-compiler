# Discriminated Unions

A discriminated union is a union of object types that all have one property, the tag (`kind`, `type`, or `status`), with a different literal value in each. Check the tag and TypeScript narrows the value to that member, so its own fields become available.

### Define and narrow

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
      //               ^? (parameter) shape: { kind: "circle"; radius: number; }
    case "rect":
      return shape.width * shape.height;
      //     ^? (parameter) shape: { kind: "rect"; width: number; height: number; }
  }
}

console.log(area({ kind: "circle", radius: 1 }).toFixed(2)); // 3.14
console.log(area({ kind: "rect", width: 2, height: 3 }));    // 6
```

Every `case` returns, so the `switch` covers the union and the function needs no `return` after it.

### A boolean tag: results

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parsePort(text: string): Result<number> {
  const port = Number(text);
  if (!Number.isInteger(port) || port <= 0) return { ok: false, error: `not a port: ${text}` };
  return { ok: true, value: port };
}

for (const text of ["8080", "http"]) {
  const result = parsePort(text);
  if (result.ok) console.log(result.value + 1); // 8081
  else console.log(result.error);               // not a port: http
}
```

### Exhaustive checks with never

In `default`, pass the value to a function that takes `never`. When every member has a case, nothing is left, so it compiles. Add a member and forget its case, and that line stops compiling.

```typescript harness
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number };

{{code}}
```

```typescript
function assertNever(value: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(value)}`);
}

function perimeter(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return 2 * Math.PI * shape.radius;
    case "rect":
      return 2 * (shape.width + shape.height);
    default:
      return assertNever(shape);
      //                 ^? (parameter) shape: never
  }
}

console.log(perimeter({ kind: "rect", width: 2, height: 3 })); // 10
```

```typescript harness
function assertNever(value: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(value)}`);
}

{{code}}
```

```typescript error
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

function perimeter(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return 2 * Math.PI * shape.radius;
    case "rect":
      return 2 * (shape.width + shape.height);
    default:
      return assertNever(shape);
      // TS2345: Argument of type '{ kind: "triangle"; base: number; height: number; }'
      // is not assignable to parameter of type 'never'.
  }
}
```

| In `default` | When a member has no case |
| --- | --- |
| `return assertNever(shape)` | TS2345, and it throws if bad data gets in at runtime |
| `const unhandled: never = shape` | TS2322 |
| `shape satisfies never;` | TS1360, with no helper to write |
| no `default`, return type annotated | TS2366, "Function lacks ending return statement" |

### Model state

Put each field only on the states where it exists. A loading request has no data, and a failed one has a message.

```typescript
type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; names: string[] }
  | { status: "error"; message: string };

function render(state: FetchState): string {
  switch (state.status) {
    case "idle":
      return "Press Load";
    case "loading":
      return "Loading...";
    case "success":
      return state.names.join(", ");
    case "error":
      return `Failed: ${state.message}`;
  }
}

const states: FetchState[] = [
  { status: "loading" },
  { status: "success", names: ["Ada", "Grace"] },
  { status: "error", message: "timeout" },
];
for (const state of states) console.log(render(state));
// Loading...
// Ada, Grace
// Failed: timeout
```

Name each state, and let a transition take only the state it starts from. Shipping a pending order then doesn't compile.

```typescript
type PendingOrder = { status: "pending"; id: string };
type PaidOrder = { status: "paid"; id: string; paidAt: string };
type ShippedOrder = { status: "shipped"; id: string; paidAt: string; tracking: string };
type Order = PendingOrder | PaidOrder | ShippedOrder;

function ship(order: PaidOrder, tracking: string): ShippedOrder {
  return { ...order, status: "shipped", tracking };
}

const paid: PaidOrder = { status: "paid", id: "o1", paidAt: "2026-10-01" };
const shipped: Order = ship(paid, "1Z999");
console.log(`${shipped.id}: ${shipped.status}`); // o1: shipped
```

```typescript harness
type PendingOrder = { status: "pending"; id: string };
type PaidOrder = { status: "paid"; id: string; paidAt: string };
type ShippedOrder = { status: "shipped"; id: string; paidAt: string; tracking: string };

function ship(order: PaidOrder, tracking: string): ShippedOrder {
  return { ...order, status: "shipped", tracking };
}

{{code}}
```

```typescript error
const pending: PendingOrder = { status: "pending", id: "o2" };
ship(pending, "1Z999");
// TS2741: Property 'paidAt' is missing in type 'PendingOrder' but required in type 'PaidOrder'.
```

### Derive types from the union

```typescript harness
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number };

{{code}}
```

```typescript
type Kind = Shape["kind"];
//   ^? type Kind = "circle" | "rect"
type Circle = Extract<Shape, { kind: "circle" }>;
//   ^? type Circle = { kind: "circle"; radius: number; }

const labels: Record<Kind, string> = { circle: "Circle", rect: "Rectangle" };
console.log(labels.rect); // Rectangle
```

A `Record` keyed by the tags must list every tag, so a new member also breaks every lookup table that misses it (TS2741).

| Pattern | Does |
| --- | --- |
| `switch (x.kind)` | narrows `x` in each `case` |
| `if (x.kind === "circle")` | narrows inside the `if`, and after an early `return` |
| `if (result.ok)` | a boolean tag narrows the same way |
| `U["kind"]` | the union of the tags |
| `Extract<U, { kind: "circle" }>` | the member with that tag |
| `Record<U["kind"], T>` | one entry per tag, checked |

### Gotchas

- An object literal stored without a type widens its tag: `const c = { kind: "circle", radius: 1 }` has `kind: string`, so `area(c)` fails (TS2345). Write `const c: Shape = ...`, or add `as const`.
- A `default` that returns a fallback value swallows new members. Put the never check there instead.
- Reading a field that only some members have, like `shape.radius` before narrowing, is TS2339. Check the tag first, or use `"radius" in shape`.
- The tag must be a literal type in every member. One member with `kind: string` stops the narrowing.
