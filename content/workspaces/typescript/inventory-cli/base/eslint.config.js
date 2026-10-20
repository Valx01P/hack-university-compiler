// Lint rules for bugs that type-check: a promise nobody awaits, a switch that misses a case,
// an `any` someone typed. typescript-eslint reads the types through the TypeScript 6.0 API,
// which is why package.json installs "typescript" as @typescript/typescript6 and TypeScript 7
// as @typescript/native. `npx tsc` still runs 7.0.2, and `npx tsc6` runs 6.0.
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["data/", "fixtures/"] },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      // A switch over a union must handle every member, or say why it doesn't with a default.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // Numbers read fine in template strings (`${qty} left`), so allow them.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // node:test's test() returns a promise that the runner awaits itself.
      "@typescript-eslint/no-floating-promises": [
        "error",
        { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] }] },
      ],
    },
  },
);
