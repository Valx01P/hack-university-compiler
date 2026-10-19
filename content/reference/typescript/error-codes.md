# Error Codes

Every `tsc` error has a code like TS2322, and each code has a usual cause and a usual fix. These are the 30 you'll meet most, with fixes that change the code or the type, never `as` or `@ts-ignore`.

### Reading a diagnostic

```typescript error
type Profile = { name: string; age: number };
const input = { name: "Ada", age: "36" };
const profile: Profile = input;
```

```text
main.ts(3,7): error TS2322: Type '{ name: string; age: string; }' is not assignable to type 'Profile'.
  Types of property 'age' are incompatible.
    Type 'string' is not assignable to type 'number'.
```

The file, the line and column, the code, then the message. Each indented line explains the one above it, and the deepest one is usually the real problem.

### Types that don't fit

```typescript error
type User = { id: number; name: string };
type Profile = { name: string; nickname?: string };

let count: number = "3"; // TS2322
console.log(Math.round("2.5")); // TS2345
const ada: User = { id: 1 }; // TS2741
const none: User = {}; // TS2739
const bob: User = { id: 2, name: "Bob", admin: true }; // TS2353
const grace: Profile = { name: "Grace", nickname: undefined }; // TS2375
console.log("a-b".replace("-", 5)); // TS2769
console.log(count === "3"); // TS2367
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS2322 | `Type 'string' is not assignable to type 'number'.` | convert the value (`Number(text)`), or fix the annotation if it was wrong |
| TS2345 | `Argument of type 'string' is not assignable to parameter of type 'number'.` | pass the type the function takes, or widen its parameter |
| TS2741 | `Property 'name' is missing in type '{ id: number; }' but required in type 'User'.` | add the property, or make it optional in the type (`name?: string`) |
| TS2739 | `Type '{}' is missing the following properties from type 'User': id, name` | build the whole object, or use `Partial<User>` while you fill it in |
| TS2353 | `Object literal may only specify known properties, and 'admin' does not exist in type 'User'.` | drop the extra key, or add it to the type if it belongs there |
| TS2375 | `Type '{ name: string; nickname: undefined; }' is not assignable to type 'Profile' with 'exactOptionalPropertyTypes: true'. ...` | leave the optional key out instead of setting it to `undefined` |
| TS2769 | `No overload matches this call.` | read the elaboration under the last overload: it names the argument that fails |
| TS2367 | `This comparison appears to be unintentional because the types 'number' and 'string' have no overlap.` | compare values of the same type: `count === 3` |

### Maybe undefined, null, or unknown

```typescript error
const scores = [90, 72];
const first = scores[0];
console.log(first.toFixed(1)); // TS18048

const tags = new Map<string, string[]>();
tags.get("ts").push("types"); // TS2532

const match = /(\d+)/.exec("order 42");
console.log(match[1]); // TS18047

try {
  JSON.parse("{");
} catch (err) {
  console.log(err.message); // TS18046
}
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS18048 | `'first' is possibly 'undefined'.` | check it (`if (first !== undefined)`), use `?.` or `??`, or give a default |
| TS2532 | `Object is possibly 'undefined'.` | the same, for an expression with no name, like `tags.get("ts")` |
| TS18047 | `'match' is possibly 'null'.` | handle the `null`: `if (match === null) return` |
| TS18046 | `'err' is of type 'unknown'.` | narrow it with `instanceof Error`, `typeof`, or a schema |

### Names, properties, and modules

```typescript error
import { chunk } from "lodash"; // TS2307

type User = { id: number; name: string };
const user: User = { id: 1, name: "Ada" };
console.log(user.email); // TS2339
console.log(user.nme); // TS2551
console.log(username); // TS2304
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS2307 | `Cannot find module 'lodash' or its corresponding type declarations.` | install the package, or fix the path |
| TS2339 | `Property 'email' does not exist on type 'User'.` | add it to the type, or narrow a union to the member that has it |
| TS2551 | `Property 'nme' does not exist on type 'User'. Did you mean 'name'?` | fix the typo |
| TS2304 | `Cannot find name 'username'.` | declare or import it (TS2552 is the same with a "Did you mean") |

### Implicit any

```typescript error
function total(prices) { // TS7006
  return prices.reduce((sum: number, p: number) => sum + p, 0);
}

const stock = { mug: 3, kettle: 1 };
const key: string = "mug";
console.log(stock[key]); // TS7053
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS7006 | `Parameter 'prices' implicitly has an 'any' type.` | annotate it: `prices: readonly number[]` |
| TS7053 | `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ mug: number; kettle: number; }'.` | type the key `keyof typeof stock`, or the object `Record<string, number>` |
| TS7016 | `Could not find a declaration file for module 'legacy-fx'. '…/node_modules/legacy-fx/index.js' implicitly has an 'any' type.` | install `@types/legacy-fx`, or write a `.d.ts` for the package |

### Functions and classes

```typescript error
function area(width: number, height: number): number {
  return width * height;
}
console.log(area(3)); // TS2554

function sign(n: number): string { // TS2366
  if (n > 0) return "+";
  if (n < 0) return "-";
}

class Shape {
  readonly id: string = "s1";
  sides: number; // TS2564
  area(): number {
    return 0;
  }
}
class Square extends Shape {
  area(): number { // TS4114
    return 4;
  }
}
new Square().id = "s2"; // TS2540
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS2554 | `Expected 2 arguments, but got 1.` | pass every argument, or make the parameter optional or give it a default |
| TS2366 | `Function lacks ending return statement and return type does not include 'undefined'.` | return on every path, or end with a `throw` |
| TS2564 | `Property 'sides' has no initializer and is not definitely assigned in the constructor.` | give it a value where you declare it, or assign it in the constructor |
| TS4114 | `This member must have an 'override' modifier because it overrides a member in the base class 'Shape'.` | write `override` before the method |
| TS2540 | `Cannot assign to 'id' because it is a read-only property.` | make a new object instead of changing this one |

### Modules, Node, and directives

```typescript error
import { RequestListener } from "node:http"; // TS1484
import type {} from "./main"; // TS2835

enum Size { S, M, L } // TS1294

async function isAdmin(): Promise<boolean> {
  return false;
}
if (isAdmin()) console.log("admin"); // TS2801

// @ts-expect-error
const fine: number = 1; // TS2578, reported on the line above
```

| Code | Message | Usual fix |
| --- | --- | --- |
| TS1484 | `'RequestListener' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.` | `import type { RequestListener }`, or `import { type RequestListener }` |
| TS2835 | `Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './main.js'?` | name the file: `./main.ts`, since Node runs the `.ts` file itself |
| TS1294 | `This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` | an `as const` object for an `enum`, fields for parameter properties |
| TS2591 | `Cannot find name 'process'. Do you need to install type definitions for node? ...` | add `"types": ["node"]` to `tsconfig.json`, with `@types/node` installed |
| TS2801 | `This condition will always return true since this 'Promise<boolean>' is always defined.` | `await` the promise |
| TS2578 | `Unused '@ts-expect-error' directive.` | the error it expected is gone, so delete the comment |

### Gotchas

- Fix the first error first. One wrong type upstream can cause a dozen errors below it.
- `as`, `!`, and `@ts-ignore` silence the message and keep the bug. Each fix above changes the code or the type instead.
- TS2835 suggests `.js`, but code that Node runs straight from `.ts` files imports `./file.ts`.
- `any` switches checking off for everything it touches. Fix TS7006 and TS7016 rather than hiding them with `any`.
