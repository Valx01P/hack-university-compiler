# tsconfig

`tsconfig.json` tells `tsc` which files to check (`include`) and how strictly (`compilerOptions`). `npx tsc --showConfig` prints the options it ends up with, `extends` included.

### A config for code Node runs

Node runs the `.ts` files itself, so `tsc` only checks (`noEmit`). This is the config every program on this site is checked with, pointed at `src` and `test`:

```text
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noUncheckedSideEffectImports": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

### Strictness

`strict` turns on a family of checks. Each error below names its flag:

```typescript error
function double(n) { // TS7006: noImplicitAny
  return n * 2;
}

let label: string = null; // TS2322: strictNullChecks

class Cart {
  total: number; // TS2564: strictPropertyInitialization
}

try {
  JSON.parse("{");
} catch (err) {
  console.log(err.message); // TS18046: useUnknownInCatchVariables
}
```

The flags past `strict`:

```typescript
const sizes = ["S", "M", "L"];
const first = sizes[0]; // noUncheckedIndexedAccess: an index may be missing
//    ^? const first: string | undefined
console.log(first?.toLowerCase() ?? "none"); // s

const stock: Record<string, number> = { mug: 3 };
const kettles = stock["kettle"];
//    ^? const kettles: number | undefined
console.log(kettles ?? 0); // 0
```

```typescript error
type Profile = { name: string; nickname?: string };
const ada: Profile = { name: "Ada", nickname: undefined }; // TS2375: exactOptionalPropertyTypes

class Shape {
  area(): number {
    return 0;
  }
}
class Square extends Shape {
  area(): number { // TS4114: noImplicitOverride
    return 4;
  }
}

function label(size: number): string {
  switch (size) {
    case 1: // TS7029: noFallthroughCasesInSwitch
      console.log("one");
    case 2:
      return "small";
    default:
      return "large";
  }
}
```

| Flag | Catches |
| --- | --- |
| `strict` | turns on `noImplicitAny`, `strictNullChecks`, `strictPropertyInitialization`, `useUnknownInCatchVariables`, `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, and more |
| `noUncheckedIndexedAccess` | `arr[i]` and `record[key]` read as possibly `undefined` |
| `exactOptionalPropertyTypes` | `nickname?: string` can be left out, but not set to `undefined` |
| `noImplicitOverride` | a method that replaces a base class method without `override` |
| `noFallthroughCasesInSwitch` | a `case` that runs into the next one |
| `noImplicitReturns` | a function that returns a value on some paths only |
| `noUnusedLocals`, `noUnusedParameters` | names you declare and never use |
| `noPropertyAccessFromIndexSignature` | `env.PORT` on an index signature: write `env["PORT"]` |

### Modules, and running on Node

```typescript error
import { RequestListener } from "node:http"; // TS1484: verbatimModuleSyntax wants import type

enum Size { S, M, L } // TS1294: erasableSyntaxOnly, Node can't strip an enum
```

| Flag | Does |
| --- | --- |
| `"module": "nodenext"` | Node's rules: ES modules or CommonJS by `package.json` `"type"`, and imports name real files |
| `"module": "preserve"` with `"moduleResolution": "bundler"` | a bundler's rules (Vite): imports without extensions |
| `verbatimModuleSyntax` | imports of types must say `import type`, so stripping types leaves exactly your imports |
| `erasableSyntaxOnly` | rejects syntax Node can't strip: `enum`, parameter properties, `namespace` with code |
| `allowImportingTsExtensions` | allows `import "./greet.ts"`, and needs `noEmit` (or `emitDeclarationOnly`) |
| `rewriteRelativeImportExtensions` | writes `./greet.js` for `./greet.ts` when `tsc` emits the JavaScript |
| `isolatedModules` | each file must compile on its own, as Node, esbuild, and Vite compile it |
| `moduleDetection: "force"` | every file is a module, even with no `import` or `export` |
| `types` | the global type packages to load: `["node"]` |
| `lib` | the built-in APIs that exist: `["esnext"]`, plus `"DOM"` in a browser |
| `resolveJsonModule` | `import data from "./data.json" with { type: "json" }` |

### Emit

| Flag | Does |
| --- | --- |
| `noEmit` | check only: Node or a bundler runs the code |
| `outDir`, `rootDir` | where the JavaScript goes, and the source folder it mirrors |
| `declaration`, `declarationMap` | write `.d.ts` files (and maps to the source) for a library |
| `sourceMap` | map stack traces back to the `.ts` lines |
| `emitDeclarationOnly` | write only `.d.ts` files, another tool writes the JavaScript |
| `isolatedDeclarations` | exports need explicit types, so any tool can write the `.d.ts` files |
| `composite`, `incremental` | project references for `tsc -b`, and a cache between builds |

### extends and shared bases

```text
{
  "extends": ["@tsconfig/node26/tsconfig.json", "@tsconfig/strictest/tsconfig.json"],
  "compilerOptions": {
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

Later bases win over earlier ones, and your own `compilerOptions` win over both. `@tsconfig/node26` sets `module: nodenext`, `target: es2025`, `lib` (with `ESNext.Temporal`), and `types: ["node"]`. `@tsconfig/strictest` adds `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `noPropertyAccessFromIndexSignature`, and more.

### TypeScript 7 defaults and removed options

| Option | Default in TypeScript 7 |
| --- | --- |
| `strict` | `true` |
| `target` | `es2025` |
| `module` | `esnext` |
| `moduleResolution` | `nodenext` with `module: nodenext`, else `bundler` |
| `types` | `[]`: no `@types` package loads until you list it |
| `rootDir` | the folder `tsconfig.json` is in |
| `noUncheckedSideEffectImports`, `esModuleInterop` | `true` |

Removed, each now an error that says "has been removed. Please remove it from your configuration": `target: "es5"`, `moduleResolution: "node10"` (also spelled `"node"`) and `"classic"`, `module: "amd"`, `"umd"`, and `"system"`, `baseUrl` (use `paths`), `outFile`, `downlevelIteration`, and `esModuleInterop: false`.

### Gotchas

- `node main.ts` never reads `tsconfig.json`: it strips the types and runs, type errors and all. Run `npx tsc` to check.
- TypeScript 7 loads no `@types` package unless `types` lists it, so without `"types": ["node"]` even `process` is TS2591.
- With `outDir` and no `rootDir`, `src/main.ts` lands in `dist/src/main.js` and `tsc` reports TS5011. Set `"rootDir": "src"`.
- `paths` changes only what `tsc` resolves. Node never reads it, so an alias that type-checks fails at runtime. Use `package.json` `"imports"` (`#domain/*`) instead.
