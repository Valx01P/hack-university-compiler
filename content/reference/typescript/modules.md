# Modules

Every `.ts` file is an ES module: `export` makes a name available, `import` brings it in, and Node runs the imports as written once the types are stripped. A relative import names the real file with its extension (`./greet.ts`), and an import of a type says so with `type`.

### Import forms

```typescript
import fs from "node:fs";
import { existsSync, statSync as stat } from "node:fs";
import * as path from "node:path";
import * as z from "zod";

console.log(existsSync("package.json"));    // true
console.log(stat("package.json").isFile()); // true
console.log(path.extname("notes.txt"));     // .txt
console.log(fs.existsSync === existsSync);  // true
console.log(z.string().parse("ok"));        // ok

const { platform } = await import("node:os");
console.log(platform());                    // linux
```

`import()` loads a module when the line runs, and top-level `await` works because the file is a module. In the sandbox you can import `node:` built-ins and `zod`.

### Export forms

```typescript
export const VERSION = "1.4.0";

export function greet(name: string): string {
  return `Hi, ${name}`;
}

export type Greeting = ReturnType<typeof greet>;

const answer = 42;
export { answer, answer as theAnswer };

export default function main(): void {
  console.log(greet("Ada"), VERSION); // Hi, Ada 1.4.0
}

export { join } from "node:path";
export * as os from "node:os";

main();
```

The last two lines re-export: they pass on another module's exports without using them here. Across two files, the importing file names the other one with its extension. This needs two files, so it can't run in a single-file block.

```text
// greet.ts
export function greet(name: string): string {
  return `Hi, ${name}`;
}

// main.ts
import { greet } from "./greet.ts";
console.log(greet("Ada")); // Hi, Ada
```

### Relative imports need the extension

Without the extension, `tsc` reports TS2835 and Node fails with `ERR_MODULE_NOT_FOUND`. For a TypeScript file the message suggests `./greet.js`, but write `./greet.ts`: Node runs the `.ts` file itself, and the course config's `allowImportingTsExtensions` (with `noEmit`) lets `tsc` accept it.

```typescript error
import pkg from "./package" with { type: "json" };
// TS2835: Relative import paths need explicit file extensions in ECMAScript imports
// when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './package.json'?
console.log(pkg);
```

### Type-only imports

Types are erased before Node runs the file, so an import of a type must say `type`, on the whole line or on one name. With `verbatimModuleSyntax` on, leaving it out is TS1484.

```typescript
import { statSync, type PathLike } from "node:fs";
import type { Stats } from "node:fs";

function kind(stats: Stats): string {
  return stats.isDirectory() ? "folder" : "file";
}

const target: PathLike = "package.json";
console.log(kind(statSync(target))); // file
```

```typescript error
import { PathLike } from "node:fs";
// TS1484: 'PathLike' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
const target: PathLike = "package.json";
console.log(target);
```

Without the checker, Node fails on the same line: `SyntaxError: The requested module 'node:fs' does not provide an export named 'PathLike'`.

### JSON imports

Import a JSON file as the default export, with `with { type: "json" }`. The sandbox writes this `package.json` next to your `main.ts`.

```typescript
import pkg from "./package.json" with { type: "json" };

console.log(pkg);      // { type: 'module' }
console.log(pkg.type); // module
```

Leaving out `with { type: "json" }` is TS1543, and a named import like `import { type } from "./package.json"` is TS1544.

### import.meta

`import.meta` describes the current file. Build paths from `import.meta.dirname` so they work from any working folder. The sandbox runs your file as `/work/main.ts`.

```typescript
import { join } from "node:path";

console.log(import.meta.filename); // /work/main.ts
console.log(import.meta.dirname);  // /work
console.log(import.meta.url);      // file:///work/main.ts
console.log(import.meta.main);     // true
console.log(join(import.meta.dirname, "data", "inventory.json")); // /work/data/inventory.json
```

`import.meta.main` is `true` in the file Node started, so a module can run code only when it's run directly.

### Subpath imports

A `#` import is Node's replacement for tsconfig `paths`. Node resolves it from `"imports"` in `package.json` with no build step, and `tsc` reads the same map. It needs a `package.json` and a folder of files, so it can't run in a single-file block.

```text
// package.json
{
  "type": "module",
  "imports": { "#domain/*": "./src/domain/*" }
}

// src/commands/list.ts
import { isLowStock } from "#domain/item.ts";
```

A project that emits JavaScript with `rewriteRelativeImportExtensions`, instead of `allowImportingTsExtensions`, can't end a subpath in `.ts` (TS2877).

### CommonJS interop

An ES module has no `require`. Make one with `createRequire` when you must load CommonJS code. It returns `any`, so give the result a type.

```typescript
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const pkg: { type: string } = require("./package.json");
console.log(pkg.type);                 // module
console.log(require("node:fs") === fs); // true
```

The default import of a built-in like `node:fs` is the same object CommonJS code gets from `require`, and importing a CommonJS package gives you its `module.exports` the same way. TypeScript's own CommonJS syntax isn't erasable.

```typescript error
import fs = require("node:fs");
// TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
console.log(typeof fs.readFileSync);
```

| Form | Does |
| --- | --- |
| `import { a, b as c } from "./m.ts"` | named imports, one renamed |
| `import m from "./m.ts"` | the default export |
| `import * as m from "./m.ts"` | every export, as one object |
| `import "./setup.ts"` | runs a file for its side effects |
| `await import("./m.ts")` | loads a module when the line runs |
| `import type { T } from "./m.ts"` | types only, erased before Node runs |
| `import { type T, f } from "./m.ts"` | a type and a value from one module |
| `import data from "./data.json" with { type: "json" }` | a JSON file as the default export |
| `export const x`, `export function f`, `export type T` | export where you declare it |
| `export default` | the module's one default export |
| `export { a as b }` | export under another name |
| `export { a } from "./m.ts"`, `export * from "./m.ts"` | re-export another module's names |

### Gotchas

- `__dirname`, `__filename`, `require`, and `module.exports` don't exist in an ES module. `tsc` accepts `__dirname`, which `@types/node` declares, and Node then throws `ReferenceError: __dirname is not defined in ES module scope`. Use `import.meta.dirname`.
- TS2835 suggests a `.js` extension, but this course writes `.ts`, because Node runs the `.ts` file directly.
- An import of a type without `type` is TS1484. Without the checker, Node fails with "does not provide an export named".
- `import x = require("...")` and `export = x` are TS1294 here. Use `import` and `export default`.
