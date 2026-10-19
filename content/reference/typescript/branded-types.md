# Brands and Domain Types

TypeScript compares types by shape, so two IDs that are both `string` can be swapped by mistake. A brand adds a property that exists only in the type system, and when a guard is the only way to get a branded value, every function that receives one can trust it.

### The mix-up

```typescript
type Order = { id: string; customerId: string; totalCents: number };
const orders: Order[] = [{ id: "ord_0001", customerId: "cus_01", totalCents: 1299 }];

function getOrder(id: string): Order | undefined {
  return orders.find((order) => order.id === id);
}

const customerId = "cus_01";
console.log(getOrder(customerId)); // undefined
```

It compiles, because both IDs are `string`, and it quietly finds nothing.

### Brand an ID

```typescript
type OrderId = string & { readonly __brand: "OrderId" };
type CustomerId = string & { readonly __brand: "CustomerId" };

function isOrderId(text: string): text is OrderId {
  return /^ord_\d{4}$/.test(text);
}

function isCustomerId(text: string): text is CustomerId {
  return /^cus_\d{2}$/.test(text);
}

function parseOrderId(text: string): OrderId | null {
  return isOrderId(text) ? text : null;
}

const id = parseOrderId("ord_0001");
//    ^? const id: OrderId | null
console.log(id);                         // ord_0001
console.log(parseOrderId("cus_01"));     // null
console.log(`at runtime: ${typeof id}`); // at runtime: string
```

The guard (`text is OrderId`) is the gate: it narrows a checked string to the brand with no cast. Now passing the wrong kind of ID is a type error.

```typescript harness
type OrderId = string & { readonly __brand: "OrderId" };
type CustomerId = string & { readonly __brand: "CustomerId" };

function isCustomerId(text: string): text is CustomerId {
  return /^cus_\d{2}$/.test(text);
}

function getOrder(id: OrderId): string {
  return `order ${id}`;
}

{{code}}
```

```typescript error
function showOrder(input: string): string {
  if (!isCustomerId(input)) return "not an id";
  return getOrder(input);
  // TS2345: Argument of type 'CustomerId' is not assignable to parameter of type 'OrderId'.
}
```

### Smart constructors for values

Brand a value that follows a rule, like an email that was trimmed and lowercased, or an amount in whole cents. Normalize first, then check the result with the guard.

```typescript
type Email = string & { readonly __brand: "Email" };

function isEmail(text: string): text is Email {
  return /^[^@\s]+@[^@\s]+$/.test(text);
}

function parseEmail(text: string): Email | null {
  const normalized = text.trim().toLowerCase();
  return isEmail(normalized) ? normalized : null;
}

console.log(parseEmail("  Ada@Example.COM ")); // ada@example.com
console.log(parseEmail("ada"));                // null
```

Arithmetic on a branded number gives a plain `number`, so check the result again before you return it as the brand.

```typescript
type Cents = number & { readonly __brand: "Cents" };

function isCents(n: number): n is Cents {
  return Number.isSafeInteger(n);
}

function toCents(dollars: string): Cents | null {
  if (!/^\d+(\.\d{2})?$/.test(dollars)) return null;
  const cents = Math.round(Number(dollars) * 100);
  return isCents(cents) ? cents : null;
}

function addCents(a: Cents, b: Cents): Cents {
  const sum = a + b;
  //    ^? const sum: number
  if (!isCents(sum)) throw new RangeError(`not whole cents: ${sum}`);
  return sum;
}

const price = toCents("12.50");
const tax = toCents("1.25");
if (price !== null && tax !== null) console.log(addCents(price, tax)); // 1375
console.log(toCents("12.5"));                                          // null
```

`addCents(5, 10)` is TS2345: a plain number isn't `Cents` until `isCents` says so.

### A reusable Brand type

Libraries key the brand with a `unique symbol` instead of a name, so it can't clash with a real property.

```typescript
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

type Port = Brand<number, "Port">;

function isPort(n: number): n is Port {
  return Number.isInteger(n) && n > 0 && n < 65536;
}

function listen(port: Port): string {
  return `listening on ${port}`;
}

const port = Number("8080");
if (isPort(port)) console.log(listen(port)); // listening on 8080
```

### Non-empty arrays

`[T, ...T[]]` is an array with at least one element, so a function that needs one can read it without checking for `undefined`.

```typescript
type NonEmptyArray<T> = [T, ...T[]];

function isNonEmpty<T>(items: readonly T[]): items is NonEmptyArray<T> {
  return items.length > 0;
}

function average(xs: NonEmptyArray<number>): number {
  const [first, ...rest] = xs;
  //     ^? const first: number
  return rest.reduce((sum, n) => sum + n, first) / xs.length;
}

const readings: number[] = [4, 5];
if (isNonEmpty(readings)) console.log(average(readings)); // 4.5
console.log(average([7]));                                // 7
```

```typescript harness
type NonEmptyArray<T> = [T, ...T[]];

function average(xs: NonEmptyArray<number>): number {
  const [first, ...rest] = xs;
  return rest.reduce((sum, n) => sum + n, first) / xs.length;
}

{{code}}
```

```typescript error
console.log(average([]));
// TS2345: Argument of type '[]' is not assignable to parameter of type 'NonEmptyArray<number>'.
```

### Readonly domain objects

Make the domain types read-only and update them by returning new objects. The checker then rejects any change in place.

```typescript
type OrderLine = Readonly<{ sku: string; qty: number }>;
type Order = Readonly<{ id: string; lines: readonly OrderLine[] }>;

function addLine(order: Order, line: OrderLine): Order {
  return { ...order, lines: [...order.lines, line] };
}

const order: Order = { id: "ord_0001", lines: [{ sku: "MUG", qty: 1 }] };
const updated = addLine(order, { sku: "TEA", qty: 2 });
console.log(order.lines.length);   // 1
console.log(updated.lines.length); // 2
```

```typescript harness
type OrderLine = Readonly<{ sku: string; qty: number }>;
type Order = Readonly<{ id: string; lines: readonly OrderLine[] }>;

const order: Order = { id: "ord_0001", lines: [{ sku: "MUG", qty: 1 }] };
{{code}}
```

```typescript error
order.lines.push({ sku: "TEA", qty: 2 });
// TS2339: Property 'push' does not exist on type 'readonly Readonly<{ sku: string; qty: number; }>[]'.
```

| Pattern | Does |
| --- | --- |
| `string & { readonly __brand: "OrderId" }` | a string type that only a guard hands out |
| `Brand<number, "Port">` | the same with a `unique symbol` key, reusable |
| `isOrderId(text: string): text is OrderId` | the guard: narrows a checked value to the brand |
| `parseOrderId(text: string): OrderId \| null` | a smart constructor built on the guard |
| `[T, ...T[]]` | an array with at least one element |
| `Readonly<T>`, `readonly T[]` | objects and arrays the checker won't let you change |

### Gotchas

- Brands exist only in the type system. At runtime an `OrderId` is a plain string, and nothing from `JSON.parse` or a form is branded until a guard checks it.
- `"cus_01" as OrderId` compiles and skips the check. Keep the guard as the only way in, and ban `as` with a lint rule.
- Arithmetic, `trim()`, and other operations on a branded value return the plain type. Run the guard on the result.
- `readonly` and `Readonly<T>` are compile-time checks. Code that bypasses the types, or plain JavaScript, can still change the object.
