# Types and Inference

TypeScript works out a type from every initializer and every `return`, so you annotate parameters and the functions others call, and let it infer the rest. Under `strict`, `null` and `undefined` only fit where a type says so.

### Primitive types

| Type | Holds |
| --- | --- |
| `string` | text: `"Ada"`, `'Ada'`, template literals |
| `number` | integers and decimals alike: `36`, `-3.5`, `NaN`, `Infinity` |
| `boolean` | `true`, `false` |
| `bigint` | whole numbers of any size: `9007199254740993n` |
| `null`, `undefined` | nothing, only where the type includes them: `string \| null` |
| `symbol` | unique keys: `Symbol("id")` |

```typescript
const name: string = "Ada";
const age: number = 36;
const admin: boolean = false;
const views: bigint = 9007199254740993n;
console.log(`${name} (${age}), admin: ${admin}, views: ${views}`); // Ada (36), admin: false, views: 9007199254740993
```

### Annotate

To declare the type of a variable or a parameter, put `: Type` after its name. A function's return type goes after its parameter list.

```typescript
function area(width: number, height: number): number {
  return width * height;
}

let total: number; // no initializer yet, so say what it will hold
total = area(3, 4);
console.log(total); // 12
```

### What gets inferred

A variable's type comes from its initializer, and a function's return type from its `return` statements. Each `^?` line shows the type inferred for the name above it.

```typescript
const price = 19.99 * 3;
//    ^? const price: number
const label = `Total: ${price.toFixed(2)}`;
//    ^? const label: string
const double = (n: number) => n * 2;
//    ^? const double: (n: number) => number
const doubled = [1, 2, 3].map(double);
//    ^? const doubled: number[]
console.log(label, doubled); // Total: 59.97 [ 2, 4, 6 ]
```

Parameters are the exception, since nothing is inferred from the calls. A parameter with no type and no default is an error, unless it belongs to a callback that gets its types from where it is passed (see Functions).

```typescript error
function shout(text) { // TS7006: Parameter 'text' implicitly has an 'any' type.
  return text.toUpperCase();
}
```

### const keeps literals, let widens

A `const` can never change, so it keeps the exact value as its type. `let` and object properties can change, so they widen to `string`, `number`, or `boolean`.

```typescript
const status = "active";
//    ^? const status: "active"
let mode = "dark";
//  ^? let mode: string
const config = { mode: "dark", retries: 3 };
//    ^? const config: { mode: string; retries: number; }
config.mode = "light";
console.log(status, mode, config.mode); // active dark light
```

An annotation wins over inference: `const s: string = "a"` is a `string`, not `"a"`. Literal Types has `as const` and `satisfies`, which keep the exact values.

### null and undefined

```typescript error
let nickname: string = null; // TS2322: Type 'null' is not assignable to type 'string'.
```

```typescript
let nickname: string | null = null;
console.log(nickname ?? "(none)"); // (none)
nickname = "Ace";
console.log(nickname.toUpperCase()); // ACE
```

### any, unknown, never, void

| Type | Means | Use it for |
| --- | --- | --- |
| `any` | anything goes, checking is off | nothing new: it hides bugs |
| `unknown` | anything, but you must check it before use | untrusted input: parsed JSON, `catch (err)` |
| `never` | no value can exist | functions that always throw, cases that can't happen |
| `void` | no useful return value | functions that return nothing |

```typescript
const data = JSON.parse('{"name":"Ada"}');
//    ^? const data: any
console.log(data.nmae); // undefined, and no error for the typo

const value: unknown = JSON.parse('{"name":"Ada"}');
if (typeof value === "object" && value !== null && "name" in value) {
  console.log(value.name); // Ada
}
```

```typescript error
const value: unknown = 42;
value.toFixed(1); // TS18046: 'value' is of type 'unknown'.
```

```typescript
function fail(message: string): never {
  throw new Error(message);
}
const port = Number("8080") || fail("bad port");
//    ^? const port: number

function logLine(label: string, value: number): void {
  console.log(`${label}: ${value}`);
}
logLine("port", port); // port: 8080
```

### bigint

`number` is exact only up to `Number.MAX_SAFE_INTEGER` (9007199254740991). A `bigint` literal ends in `n`.

```typescript
console.log(9007199254740992 + 1);    // 9007199254740992
const big = 9007199254740992n;
console.log(big + 1n);                // 9007199254740993n
console.log(7n / 2n);                 // 3n (whole numbers only)
console.log(BigInt(10) * big);        // 90071992547409920n
console.log(Number(10n) + 1);         // 11
```

```typescript error
const views: bigint = 10n;
const extra: number = 1;
console.log(views + extra); // TS2365: Operator '+' cannot be applied to types 'bigint' and 'number'.
```

### Gotchas

- `String`, `Number`, and `Boolean` with a capital letter are wrapper object types. Write `string`, `number`, and `boolean`.
- `any` spreads: whatever you compute from an `any` is `any` too, so typos and wrong calls compile.
- An inferred return type changes whenever the body does. Annotate the return type of functions other code calls, so a mistake shows up inside the function.
- `bigint` and `number` never mix in arithmetic. Convert with `BigInt(n)` or `Number(b)` first.
