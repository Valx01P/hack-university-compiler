// The file name a sandbox run uses, so compile errors and tracebacks point at
// the name the editor shows (main.py, main.cpp, Main.java, main.go). Piston's
// C++, Java, and Go runtimes add the extension themselves. Shared by the app
// and the verifiers.

const NAMES = { python: "main.py", cpp: "main", java: "Main", go: "main" };

// ES module syntax: a line that starts with an import or export statement.
// Dynamic import() and import.meta don't count, CommonJS code can use those.
const ESM = /^\s*(?:import\s*(?:[\w*{$]|["'])|export\s+(?:default\b|const\b|let\b|var\b|function\b|class\b|async\b|\{|\*))/m;

/** Whether JavaScript code is an ES module (it uses import or export). */
export const isEsModule = (code) => ESM.test(code);

/** The name to give the code's file. JavaScript that uses import or export
    runs as an ES module (main.mjs), anything else as CommonJS (main.js), so
    both `import fs from "fs"` and `require("fs")` work. */
export function sourceFileName(language, code) {
  if (language === "javascript") return isEsModule(code) ? "main.mjs" : "main.js";
  return NAMES[language];
}
