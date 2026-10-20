// Lint rules for the TypeScript half of the shop: typescript-eslint's recommended rules plus
// the type-aware ones that catch promises nobody waits for. typescript-eslint reads the types
// through the TypeScript 6.0 API, which is why package.json installs "typescript" as
// @typescript/typescript6 and TypeScript 7 as @typescript/native (npx tsc still runs 7.0.2).
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["vendor/", "data/"] },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
);
