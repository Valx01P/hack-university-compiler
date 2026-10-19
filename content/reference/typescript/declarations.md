# Declaration Files

A `.d.ts` file holds only types: it describes JavaScript that lives somewhere else, so `tsc` can check the code that uses it. `tsc` writes them for your own code (`"declaration": true`), and you write them by hand for JavaScript that has none.

### What tsc writes for a module

```typescript
export type Currency = "USD" | "EUR";

export function formatCents(cents: number, currency: Currency = "USD") {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export const VERSION = "2.1.0";

export class Cart {
  #items: number[] = [];

  add(cents: number): this {
    this.#items.push(cents);
    return this;
  }

  get total() {
    return this.#items.reduce((sum, c) => sum + c, 0);
  }
}

console.log(formatCents(new Cart().add(1250).add(399).total)); // 16.49 USD
```

`tsc` with `"declaration": true` writes this `money.d.ts` beside the JavaScript, with the inferred types spelled out:

```text
export type Currency = "USD" | "EUR";
export declare function formatCents(cents: number, currency?: Currency): string;
export declare const VERSION = "2.1.0";
export declare class Cart {
    #private;
    add(cents: number): this;
    get total(): number;
}
```

### Write one for untyped JavaScript

Put `index.d.ts` next to the package's `index.js`, and point `"types": "index.d.ts"` in its `package.json` at it. `declare` means "this exists at runtime, here is its type", and nothing has a body:

```typescript types
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY";

export declare function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number;
export declare function getRates(): Readonly<Record<CurrencyCode, number>>;
export declare const lastUpdated: Date;

export declare class RateError extends Error {
  readonly code: "UNKNOWN_CURRENCY" | "STALE_RATES";
  constructor(code: RateError["code"], message: string);
}
```

### declare module, for a package you can't change

A `.d.ts` file in your project with no top-level `import` or `export` can declare a whole module. It never runs, so it has no Run button here:

```typescript norun
// types/legacy-geo.d.ts
declare module "legacy-geo" {
  export function distanceKm(from: [number, number], to: [number, number]): number;
}

// a bundler's CSS modules
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
```

`declare module "legacy-geo";` on its own is the last resort: it silences TS7016, and every import from the package is `any`.

### declare global

```typescript
declare global {
  var __BUILD_ID__: string | undefined;
  namespace NodeJS {
    interface ProcessEnv {
      INVOICE_CURRENCY?: "USD" | "EUR" | "GBP";
    }
  }
}

console.log(globalThis.__BUILD_ID__ ?? "dev"); // dev
const currency = process.env.INVOICE_CURRENCY;
//    ^? const currency: "EUR" | "GBP" | "USD" | undefined
console.log(currency ?? "USD"); // USD
```

In a `.d.ts` file of its own, add `export {}` so the file is a module, or `declare global` is an error. A global needs `var`: `let` and `const` don't become properties of `globalThis`.

### Add to a library's types: module augmentation

```typescript
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";

declare module "node:http" {
  interface IncomingMessage {
    userId?: string; // set by the auth middleware
  }
}

const req = new IncomingMessage(new Socket());
req.userId = "cus_01";
console.log(req.userId); // cus_01
//              ^? (property) IncomingMessage.userId?: string
```

Interfaces merge, so the new field joins the library's own. Express's `Request` gets its `user` the same way.

### How tsc finds the types for an import

1. A `declare module "pkg"` in a `.d.ts` file your config includes.
2. The package's own: the `"types"` condition in its `"exports"`, else its `"types"` field, else a `.d.ts` beside its JavaScript.
3. `node_modules/@types/pkg`, from DefinitelyTyped.
4. None of these: TS7016 "Could not find a declaration file for module 'pkg'", and the import is `any`.

`"types": ["node"]` in `tsconfig.json` only picks the global packages that load without an import, such as `@types/node`. A package you import always brings its own types.

### exports with types

```text
{
  "name": "@hu/money",
  "version": "2.2.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./format": {
      "types": "./dist/format.d.ts",
      "default": "./dist/format.js"
    }
  },
  "files": ["dist"]
}
```

Conditions match from the top, so `"types"` goes first in each entry. A path missing from `"exports"` can't be imported, by Node (`ERR_PACKAGE_PATH_NOT_EXPORTED`) or by `tsc` (TS2307).

### Build and publish

`tsconfig.build.json` turns emit on for the library's source:

```text
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowImportingTsExtensions": false,
    "rewriteRelativeImportExtensions": true,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

| Command | Does |
| --- | --- |
| `npx tsc -p tsconfig.build.json` | writes `dist/*.js`, `dist/*.d.ts`, and `.d.ts.map` files |
| `npm pack --dry-run` | lists exactly what `npm publish` would upload |
| `npx tsc --traceResolution` | shows each place `tsc` looked for a module's types |

### Gotchas

- `skipLibCheck: true` skips type errors in every `.d.ts` file, your own included. Turn it off now and then to audit them.
- A `.d.ts` is a promise, not a check: `tsc` trusts whatever it says about the JavaScript. Test the real behavior against it.
- `declare global` and module augmentation need the file to be a module. Add `export {}` to a `.d.ts` that has no import or export.
- Without `"rewriteRelativeImportExtensions": true`, emitted JavaScript keeps `import "./money.ts"`, which fails once only `.js` files ship.
