// Module hooks that let node --test load the app's TypeScript modules the way
// Next.js does: "@/..." from the repository root, imports without their
// extension (".ts", ".tsx", ".js", "/index.ts"), packages without an exports
// map ("next/server"), and JSON modules without an import attribute. Only the
// IDE's tests use them (tests/ide/register.mjs).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TRY = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];

export async function resolve(specifier, context, next) {
  const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
  let first;
  for (const ext of TRY) {
    try {
      return await next(spec + ext, context);
    } catch (err) {
      first ??= err;
    }
  }
  throw first;
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  // The app's .ts files are ES modules (package.json has no "type").
  if (url.startsWith("file:") && /\.m?ts$/.test(url) && !url.includes("/node_modules/")) return next(url, { ...context, format: "module-typescript" });
  return next(url, context);
}
