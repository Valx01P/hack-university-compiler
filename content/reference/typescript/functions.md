# Functions

Annotate every parameter, and the return type of any function other code calls, so a mistake shows up inside the function rather than at its callers. A function's own type is written like an arrow: `(price: number, rate: number) => number`.

### Declare

```typescript
function withTax(price: number, rate: number): number {
  return Math.round(price * (1 + rate) * 100) / 100;
}
const halve = (n: number): number => n / 2;
const greet = function (name: string): string {
  return `Hello, ${name}`;
};
console.log(withTax(20, 0.08), halve(5), greet("Ada")); // 21.6 2.5 Hello, Ada
```

### Return types

`void` means the function returns nothing useful. A declared return type must hold on every path.

```typescript
function logLine(label: string, value: number): void {
  console.log(`${label}: ${value}`);
}
logLine("total", 21.6); // total: 21.6
```

```typescript error
function grade(score: number): string { // TS2366: Function lacks ending return statement and return type does not include 'undefined'.
  if (score >= 90) return "A";
  if (score >= 80) return "B";
}
```

### Optional, default, and rest parameters

```typescript
function fullName(first: string, last?: string): string {
  return last === undefined ? first : `${first} ${last}`;
}
function greet(name: string, greeting = "Hello"): string {
  return `${greeting}, ${name}!`;
}
function sum(...nums: number[]): number {
  return nums.reduce((total, n) => total + n, 0);
}
const prices = [4, 5, 6];
console.log(fullName("Ada"), "|", fullName("Ada", "Lovelace")); // Ada | Ada Lovelace
console.log(greet("Ben"), greet("Ben", "Hi"));                  // Hello, Ben! Hi, Ben!
console.log(sum(1, 2, 3), sum(...prices));                      // 6 15
```

| Parameter | Inside, it is | Callers may |
| --- | --- | --- |
| `last?: string` | `string \| undefined` | leave it out |
| `greeting = "Hello"` | `string` (from the default) | leave it out, or pass `undefined` |
| `...nums: number[]` | `number[]` | pass any number of them, or spread an array |
| `last: string \| undefined` | `string \| undefined` | must pass something, even `undefined` |

### Function types and callbacks

A callback written inline gets its parameter types from where it is passed, so `(a, b) => a + b` and `(n) => n * 10` below need no annotations.

```typescript
type BinaryOp = (a: number, b: number) => number;
const add: BinaryOp = (a, b) => a + b;
const mul: BinaryOp = (a, b) => a * b;

function applyAll(xs: number[], fn: (n: number) => number): number[] {
  return xs.map(fn);
}
console.log(add(2, 3), mul(4, 5));               // 5 20
console.log(applyAll([1, 2, 3], (n) => n * 10)); // [ 10, 20, 30 ]
```

```typescript error
function applyAll(xs: number[], fn: (n: number) => number): number[] {
  return xs.map(fn);
}
applyAll([1, 2], (s: string) => s.length); // TS2345
```

The detail lines under TS2345 say why: `Types of parameters 's' and 'n' are incompatible.`

| Type | Is |
| --- | --- |
| `(n: number) => string` | a function from a number to a string |
| `() => void` | a function whose result is ignored |
| `(...args: string[]) => number` | takes any number of strings |
| `{ (n: number): string; label: string }` | a function that also has a `label` property |
| `typeof withTax` | the type of an existing function |

### Return a function

```typescript
function makeCounter(start: number): () => number {
  let count = start;
  return () => ++count;
}
const next = makeCounter(0);
console.log(next(), next(), next()); // 1 2 3
```

### void callbacks

A callback type that returns `void` accepts a function that returns something, and the result is ignored. That is why `forEach((n) => totals.push(n))` compiles, though `push` returns a number. A function declared `: void` may not return a value.

```typescript
const totals: number[] = [];
[1, 2, 3].forEach((n) => totals.push(n * 2));
console.log(totals); // [ 2, 4, 6 ]
```

```typescript error
function save(): void {
  return 42; // TS2322: Type 'number' is not assignable to type 'void'.
}
```

### Overloads

Overloads give one function several signatures when its return type depends on its arguments. Callers see the signatures above the body, never the body's own.

```typescript
function parse(input: string): number;
function parse(input: string[]): number[];
function parse(input: string | string[]): number | number[] {
  return Array.isArray(input) ? input.map(Number) : Number(input);
}
const one = parse("42");
//    ^? const one: number
const many = parse(["1", "2"]);
//    ^? const many: number[]
console.log(one, many); // 42 [ 1, 2 ]
```

```typescript error
function parse(input: string): number;
function parse(input: string[]): number[];
function parse(input: string | string[]): number | number[] {
  return Array.isArray(input) ? input.map(Number) : Number(input);
}
parse(42); // TS2769: No overload matches this call.
```

When the return type is the same for every input, a union parameter (`input: string | string[]`) is simpler than overloads.

### this parameters

A `this` parameter comes first, declares what `this` must be, and is erased: callers never pass it.

```typescript
function describe(this: { name: string }, greeting: string): string {
  return `${greeting}, ${this.name}`;
}
const user = { name: "Ada", describe };
console.log(user.describe("Hi"));                   // Hi, Ada
console.log(describe.call({ name: "Ben" }, "Hey")); // Hey, Ben
```

```typescript error
function describe(this: { name: string }): string {
  return this.name;
}
describe(); // TS2684: The 'this' context of type 'void' is not assignable to method's 'this' of type '{ name: string; }'.
```

### Gotchas

- A required parameter can't follow an optional one (TS1016). Put the optional parameters last.
- A `() => void` callback can still return a value at runtime. Never rely on what a void callback returns.
- Calling an overloaded function with a union (`string | string[]`) fails unless one overload takes that union.
- Arrow functions have no `this` of their own, so a `this` parameter only works on a `function`.
