# Running and Checking

Node runs a `.ts` file by stripping out its types and never checks them, while `tsc` checks the types and runs nothing. Every Run here does both: `tsc` first, then `node main.ts`.

### Run a file

```typescript
const price: number = 12.5;
const quantity: number = 3;
console.log(price * quantity);                          // 37.5
console.log(typeof price, process.features.typescript); // number strip
```

Node blanks out each annotation with spaces and runs the JavaScript that is left, so line and column numbers in errors still match your file.

### Commands

| Command | Does |
| --- | --- |
| `node main.ts` | runs the file with its types erased, without checking them |
| `node --watch main.ts` | runs it again whenever the file, or a file it imports, changes |
| `tsc` | checks the project in `tsconfig.json`, and compiles it to `.js` files unless `noEmit` is on |
| `tsc --noEmit` | checks only, writes nothing |
| `tsc --watch` | checks again on every save (`-w` for short) |
| `tsc --noEmit --watch --preserveWatchOutput` | checks on every save without clearing the screen |
| `tsc -p tsconfig.build.json` | uses another config file |
| `tsc --init` | writes a starter `tsconfig.json` |
| `tsc --pretty false` | plain diagnostics without color, as the Run output shows them |

Watch with both while you work: `node --watch` in one terminal shows what the program prints, and `tsc --noEmit --watch` in another shows what is wrong with its types.

### Read a diagnostic

```typescript error
type User = { name: string; age: number };
const input = { name: "Ada", age: "36" };
const user: User = input; // TS2322, with two lines of detail
```

Run it and the output starts with `main.ts(3,7): error TS2322:`.

| Piece | Means |
| --- | --- |
| `main.ts(3,7)` | the file, line 3, column 7 |
| `error TS2322` | the code, the same for every mistake of this kind (see Error Codes) |
| `Type '{ name: string; age: string; }' is not assignable to type 'User'.` | what doesn't fit where |
| the indented lines | why, from general to specific, so read the last one first |

A type error stops the Run: nothing runs until `tsc` reports no errors.

### Turn checking off: @ts-nocheck

`// @ts-nocheck` before any code switches off type errors for the whole file. Node runs it either way.

```typescript
// @ts-nocheck
let count: number = 3;
count = "four";
console.log(count); // four
```

### Expect or ignore an error: @ts-expect-error

`// @ts-expect-error` hides the error on the next line.

```typescript
// @ts-expect-error: a string where a number belongs
const n: number = "4";
console.log(typeof n, n); // string 4
```

Once that line has no error, the directive is an error itself: `TS2578: Unused '@ts-expect-error' directive.`

```typescript error
// @ts-expect-error
const n: number = 4; // nothing wrong here, so the directive above fails
console.log(n);
```

| Comment | Does |
| --- | --- |
| `// @ts-nocheck` | before any code: no type errors in this file |
| `// @ts-expect-error` | hides the next line's error, and fails with TS2578 when there is none |
| `// @ts-ignore` | hides the next line's error, and stays silent when there is none |

### Syntax Node can't strip

Node only removes types. Syntax that turns into JavaScript of its own is refused by Node (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) and by `tsc` under `erasableSyntaxOnly` (TS1294).

```typescript error
enum Size { Small, Medium, Large } // TS1294
console.log(Size.Medium);
```

```typescript error
// @ts-nocheck
enum Size { Small, Medium, Large }
console.log(Size.Medium); // never runs: Node refuses the enum first
```

| Syntax | Erasable | Write instead |
| --- | --- | --- |
| annotations, `type`, `interface`, generics, `declare` | yes | |
| `as`, `satisfies`, `!`, `import type`, `export type` | yes | |
| `private`, `protected`, `readonly`, `abstract`, `override` | yes | |
| a `namespace` that holds only types | yes | |
| `enum`, `const enum` | no | an `as const` object and a type (see Enums and Alternatives) |
| `constructor(public name: string)` | no | a declared field, assigned in the constructor |
| a `namespace` with values | no | a module with `export` |
| `import fs = require("node:fs")` | no | `import fs from "node:fs"` |
| `export = value` | no | `export default value` |
| `<number>value` | no | `value as number` |
| decorators (`@logged`) | no: `tsc` accepts them, Node 26 stops with a `SyntaxError` | a build step, or no decorator |

The erasable form of an enum and of a parameter property:

```typescript
const Size = { Small: 0, Medium: 1, Large: 2 } as const;
type Size = (typeof Size)[keyof typeof Size];

class Product {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

const size: Size = Size.Medium;
console.log(size, new Product("Mug").name); // 1 Mug
```

### Gotchas

- Node never checks types: `node main.ts` runs a file full of type errors. Run `tsc` as well.
- `tsc main.ts` never reads `tsconfig.json`, and when one is there TypeScript 7 stops with TS5112. Run `tsc` alone, or `tsc -p <config>`.
- Without `noEmit`, `tsc` writes a `.js` file next to every `.ts` file. Use `tsc --noEmit` when Node runs the `.ts` files itself.
- `@ts-ignore` keeps hiding a line after its error is gone. Prefer `@ts-expect-error`, which tells you.
