# Unions and Narrowing

A union like `string | number` holds any one of its members, so until you check which one, you can only use what they all have. A check narrows the type inside its branch, and an early `return` narrows it for the rest of the function.

### Unions

```typescript
function formatId(id: string | number): string {
  return String(id).padStart(6, "0");
}
const cells: (string | number)[] = ["Ada", 36, "London"];
console.log(formatId(42), formatId("A7")); // 000042 0000A7
console.log(cells.join(","));              // Ada,36,London
```

```typescript error
function shout(id: string | number): string {
  return id.toUpperCase(); // TS2339: Property 'toUpperCase' does not exist on type 'string | number'.
}
```

### Every way to narrow

| Check | Narrows `x` to |
| --- | --- |
| `typeof x === "string"` | `string` (also `"number"`, `"boolean"`, `"bigint"`, `"object"`, `"function"`, `"undefined"`) |
| `if (x)` | without `null` and `undefined`, but it also skips `0` and `""` |
| `x === null`, `x !== undefined` | `null`, or everything but `undefined` |
| `"swim" in x` | the members that have a `swim` property |
| `x instanceof Date` | `Date` |
| `Array.isArray(x)` | the array members |
| `x.kind === "circle"` | the member whose `kind` is `"circle"` |
| `isUser(x)`, declared `x is User` | `User` |
| `assertIsUser(x)`, declared `asserts x is User` | `User`, for the code after the call |
| `if (x?.address)` | not `null` or `undefined`, and `x.address` is set |
| `x ?? fallback` | a result without `null` and `undefined`: `fallback` takes their place |
| `x!` | without `null` and `undefined`, with no check at all (risky) |

### typeof and early returns

```typescript
function describe(id: string | number): string {
  if (typeof id === "string") {
    return id.toUpperCase();
    //     ^? (parameter) id: string
  }
  return id.toFixed(1);
  //     ^? (parameter) id: number
}

type User = { name: string };
function nameOf(user: User | null): string {
  if (user === null) return "guest";
  return user.name;
  //     ^? (parameter) user: User
}
console.log(describe("a7"), describe(3));         // A7 3.0
console.log(nameOf({ name: "Ada" }), nameOf(null)); // Ada guest
```

### Truthiness and equality

`if (x)` removes `null` and `undefined`, and also skips `0`, `""`, and `false`. When those are real values, compare with `=== undefined` or `=== null` instead.

```typescript
function greet(name: string | null | undefined): string {
  if (name) return `Hello, ${name}`;
  return "Hello, stranger";
}
function badLabel(qty: number | undefined): string {
  if (!qty) return "missing"; // also true for 0
  return `${qty} pcs`;
}
function label(qty: number | undefined): string {
  if (qty === undefined) return "missing";
  return `${qty} pcs`;
}
console.log(greet("Ada"), "|", greet(null)); // Hello, Ada | Hello, stranger
console.log(badLabel(0), "|", label(0));     // missing | 0 pcs
```

### in, instanceof, and Array.isArray

```typescript
type Fish = { swim(): string };
type Bird = { fly(): string };
function move(animal: Fish | Bird): string {
  return "swim" in animal ? animal.swim() : animal.fly();
}
function formatWhen(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
function toList(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}
console.log(move({ swim: () => "splash" }), move({ fly: () => "flap" }));      // splash flap
console.log(formatWhen(new Date("2026-10-01T09:00:00Z")), formatWhen("soon")); // 2026-10-01 soon
console.log(toList("a"), toList(["b", "c"]));                                  // [ 'a' ] [ 'b', 'c' ]
```

### Discriminants

When every member has the same literal property (`kind` here), checking it narrows to one member. Discriminated Unions has exhaustive checks.

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
  }
}
console.log(area({ kind: "circle", radius: 1 }).toFixed(2)); // 3.14
console.log(area({ kind: "rect", width: 2, height: 3 }));    // 6
```

### Type guards: predicates and assertion functions

A function that returns `x is User` narrows its argument wherever you call it in an `if`. One declared `asserts x is string` throws instead, and narrows the code after the call. An arrow like `(n) => n !== null` is a predicate too, so `filter` with it narrows the array.

```typescript
type User = { name: string };
function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null && "name" in x && typeof x.name === "string";
}
function assertIsString(x: unknown): asserts x is string {
  if (typeof x !== "string") throw new Error(`expected a string, got ${typeof x}`);
}

const data: unknown = JSON.parse('{"name":"Ada"}');
if (isUser(data)) {
  console.log(data.name); // Ada
  //          ^? const data: User
}

const port: unknown = "8080";
assertIsString(port);
console.log(port.padStart(6, "0")); // 008080

const names = ["Ada", null, "Ben"].filter((n) => n !== null);
//    ^? const names: string[]
console.log(names); // [ 'Ada', 'Ben' ]
```

### Optional chaining and ??

`?.` is optional chaining, called safe navigation in some languages: it stops at `null` or `undefined` instead of throwing. `??` is nullish coalescing: it supplies a default for `null` or `undefined` only.

| Write | Gives |
| --- | --- |
| `a?.b`, `a?.[i]` | `a.b` or `a[i]`, or `undefined` when `a` is `null` or `undefined` |
| `fn?.()` | calls `fn` only when it isn't `null` or `undefined` |
| `a ?? b` | `a`, or `b` when `a` is `null` or `undefined` |
| `a ??= b` | sets `a` to `b` only when `a` is `null` or `undefined` |

```typescript
type Customer = { name: string; address?: { city: string } };
const customers: Customer[] = [{ name: "Ana", address: { city: "Lisbon" } }, { name: "Ben" }];
for (const c of customers) {
  console.log(`${c.name}: ${c.address?.city ?? "unknown"}`); // Ana: Lisbon, then Ben: unknown
}

const settings: { retries?: number } = {};
settings.retries ??= 3;
console.log(settings.retries); // 3
```

### The non-null assertion !

`x!`, an exclamation mark after a value, tells the checker "this is not `null` or `undefined`" without checking anything. When you are wrong, the code compiles and crashes.

```typescript error
const prices = new Map([["mug", 12.5]]);
console.log(prices.get("cup")!.toFixed(2)); // TypeError: Cannot read properties of undefined (reading 'toFixed')
```

Check the value instead, and say what is missing:

```typescript
const prices = new Map([["mug", 12.5]]);
const price = prices.get("cup");
if (price === undefined) {
  console.log("no price for cup"); // no price for cup
} else {
  console.log(price.toFixed(2));
}
```

### Type assertions with as

`value as T` is a type assertion, what other languages call a cast. Like `!`, it checks nothing at runtime, so a wrong one crashes later. Narrow or validate the value instead.

```typescript error
const input: unknown = JSON.parse('{"name":"Ada"}');
const user = input as { name: string; email: string };
console.log(user.name);                // Ada
console.log(user.email.toLowerCase()); // TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

Between unrelated types, `as` is an error (TS2352). To change a value's type, convert it: `Number("42")`.

```typescript error
const id = "42" as number; // TS2352
```

`as const` is not a cast: it only keeps literal types (see Literal Types).

### Gotchas

- `typeof null` is `"object"`, so `typeof x === "object"` doesn't rule out `null`. Add `x !== null`.
- Truthiness checks drop `0` and `""` along with `null`. Compare with `=== undefined` when zero or empty is a real value.
- Narrowing doesn't reach into callbacks for an object property or a `let` you assign again later. Copy it to a `const` first.
- `!` and `as` silence the checker without checking anything. A wrong one is a crash at runtime, so narrow instead.
