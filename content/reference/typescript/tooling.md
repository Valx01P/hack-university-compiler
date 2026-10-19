# Tooling

`tsc` checks the types and `node` runs `.ts` files by stripping them, so a Node project needs nothing else to start. Every other tool here skips type checking, so keep `tsc` in your scripts.

### tsc

| Command | Does |
| --- | --- |
| `npx tsc` | checks the project in `tsconfig.json` (and writes nothing when it sets `"noEmit": true`) |
| `npx tsc --noEmit` | checks without writing files, whatever the config says |
| `npx tsc --watch` | checks again on every save |
| `npx tsc -p tsconfig.build.json` | uses another config, for example one that emits a build |
| `npx tsc -b` | builds a project and the projects it references, in order |
| `npx tsc --pretty false` | one plain line per error: `file(line,col): error TSnnnn: message` |
| `npx tsc --showConfig` | prints the options `tsc` ends up with |
| `npx tsc --listFilesOnly`, `--explainFiles` | lists the files it checks, and why each one is included |
| `npx tsc --traceResolution` | shows how each import was resolved |
| `npx tsc --extendedDiagnostics`, `--generateTrace out` | how long checking takes, and where the time goes |
| `npx tsc --init` | writes a starter `tsconfig.json` |
| `npx tsc --lsp --stdio` | starts the language server editors talk to (7.0.2 leaves it out of `--help`) |

### Run TypeScript files

| Command | Does |
| --- | --- |
| `node main.ts` | strips the types and runs, with no type check (Node 22.18 and newer, 26.12.0 here) |
| `node --watch main.ts` | runs it again on every save |
| `node --env-file=.env main.ts` | loads environment variables from a file first |
| `node --test` | runs every `*.test.ts` file it finds, with `node:test` |
| `node --run check` | runs a `package.json` script, faster than `npm run check` |
| `npx tsx main.ts` | runs any TypeScript, enums and decorators included, also with no type check |

Node only strips syntax it can erase. `// @ts-nocheck` lets this file past `tsc`, and Node still refuses it:

```typescript error
// @ts-nocheck
enum Size { S = "small", M = "medium" } // SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode
console.log(Size.M);
```

`npx tsx main.ts` runs the same file and prints `medium`. Replace the enum with an `as const` object and plain `node` runs it too.

### ESLint with typescript-eslint

`tsc` passes this file with no errors, and it still has three bugs:

```typescript
type Category = "kitchen" | "office" | "garden";

async function save(items: string[]): Promise<void> {
  await Promise.resolve(items);
}

function label(category: Category): string {
  switch (category) { // switch-exhaustiveness-check: "garden" has no case
    case "kitchen":
      return "Kitchen";
    case "office":
      return "Office";
  }
  return "Other";
}

function parse(text: string): any { // no-explicit-any
  return JSON.parse(text);
}

save(["mug"]); // no-floating-promises: nobody waits for it or sees its error
console.log(label("garden"), parse("[1]")); // Other [ 1 ]
```

`eslint.config.js` with type-aware rules (`npx eslint .` reports all three):

```text
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.ts"],
  extends: [tseslint.configs.recommendedTypeChecked],
  languageOptions: {
    parserOptions: { projectService: true },
  },
  rules: {
    "@typescript-eslint/switch-exhaustiveness-check": "error",
  },
});
```

| Rule (`@typescript-eslint/...`) | Catches | Turned on by |
| --- | --- | --- |
| `no-floating-promises` | a promise nobody awaits or catches | `recommendedTypeChecked` |
| `no-misused-promises` | a promise where a boolean or a `void` callback belongs | `recommendedTypeChecked` |
| `await-thenable` | `await` on a value that isn't a promise | `recommendedTypeChecked` |
| `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument` | an `any` flowing into typed code | `recommendedTypeChecked` |
| `no-explicit-any` | `any` written in the code | `recommended` |
| `ban-ts-comment` | `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` without a reason after it | `recommended` |
| `no-unnecessary-condition` | a check that is always true or always false | `strictTypeChecked` |
| `no-non-null-assertion` | a postfix `!` | `strictTypeChecked` |
| `switch-exhaustiveness-check` | a `switch` on a union that misses a member | you, in `rules` |
| `consistent-type-assertions` | with `{ assertionStyle: "never" }`, every `as` except `as const` | you, in `rules` |

### TypeScript 6 and 7 side by side

typescript-eslint 8.72.0 accepts `typescript` from 4.8.4 up to 6.1.0, and TypeScript 7.0 has no API until 7.1. So a linted project installs both, under these names:

```text
"devDependencies": {
  "@typescript/native": "npm:typescript@7.0.2",
  "typescript": "npm:@typescript/typescript6@6.0.2",
  "eslint": "10.13.0",
  "typescript-eslint": "8.72.0",
  "@types/node": "26.6.5"
}
```

`npx tsc --version` prints `Version 7.0.2`, the native compiler that checks the project, and `npx tsc6 --version` prints `Version 6.0.3`, whose API typescript-eslint loads as `typescript`.

### The wider ecosystem

Names you'll meet in other codebases. None are installed here.

| Name | What it is |
| --- | --- |
| Deno, Bun | other runtimes that run `.ts` files directly |
| ts-node | an older way to run `.ts` on Node, compiling as it loads |
| esbuild, swc | fast compilers that strip types without checking them (tsx uses esbuild) |
| Biome, oxlint | fast linters written in Rust (Biome also formats) |
| valibot, ArkType | runtime validators, like zod |
| ts-pattern | pattern matching with exhaustiveness checks |
| Effect | a library for typed errors, dependencies, and concurrency |
| Prisma, Drizzle | database toolkits whose queries return typed rows |
| tRPC | API calls typed from server to client, with no schema file between them |

### Gotchas

- `node`, `node --watch`, and `tsx` run code with type errors. Keep `npx tsc --watch` open beside them, and `tsc` in your `check` script.
- With `typescript@7.0.2` and `@typescript/typescript6` installed under their own names, `npx tsc` can run 6.0.3. Use the alias names above, and check `npx tsc --version`.
- Type-aware rules need `parserOptions.projectService`, and every file they lint must be in a `tsconfig.json`, or ESLint reports "was not found by the project service".
- A lint rule set to `"error"` fails `npm run lint` just like a type error, so turn rules on one at a time in an existing codebase.
