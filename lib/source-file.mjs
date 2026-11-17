// The file name a sandbox run uses, so compile errors and tracebacks point at
// the name the editor shows (main.py, main.cpp, Main.java, main.go). Piston's
// C++, Java, and Go runtimes add the extension themselves. Shared by the app
// and the verifiers, which send what sourceFiles gives.

import { parser as jsParser } from "@lezer/javascript";

const NAMES = { python: "main.py", cpp: "main", java: "Main", go: "main" };

// ES module syntax: a line that starts with an import or export statement.
// Dynamic import() and import.meta don't count, CommonJS code can use those.
const ESM = /^\s*(?:import\s*(?:[\w*{$]|["'])|export\s+(?:default\b|const\b|let\b|var\b|function\b|class\b|async\b|\{|\*))/m;

// A function of some kind: what an await inside it belongs to.
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration"]);

/** Whether JavaScript code awaits at its top level (outside every function),
    which only an ES module can. */
export function hasTopLevelAwait(code) {
  if (!/\bawait\b/.test(code)) return false;
  let found = false;
  jsParser.parse(code).iterate({
    enter(node) {
      if (found) return false;
      if (node.name !== "await") return;
      for (let up = node.node.parent; up; up = up.parent) {
        // An object's method is a Property with its own parameters.
        if (FUNCTIONS.has(up.name) || (up.name === "Property" && up.getChild("ParamList"))) return;
      }
      found = true;
    },
  });
  return found;
}

/** Whether JavaScript code is an ES module: it uses import or export, or
    awaits at its top level (which a CommonJS script can't, and other online
    compilers run as a module too). */
export const isEsModule = (code) => ESM.test(code) || hasTopLevelAwait(code);

// Java source with its comments, strings, text blocks, and characters
// blanked out, so braces and words in them don't count.
function javaCode(code) {
  return code.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m.replace(/[^\n]/g, " "));
}

// A type's member that's a main method: static, void, and main taking a
// String array (or String...).
const JAVA_MAIN = /\bstatic\b[^;{}]*\bvoid\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]|\.\.\.)\s*[\w$]*\s*(?:\[\s*\])?\s*\)/;

/** The top-level types of Java code, in order: each one's name, whether
    it's public, and whether it declares a main method itself (not in a type
    nested inside it). */
export function javaTypes(code) {
  const src = javaCode(code);
  const types = [];
  const keyword = /(?<![\w$])(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/y;
  let depth = 0;
  let declStart = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) declStart = i + 1;
    } else if (ch === ";" && depth === 0) declStart = i + 1;
    else if (depth === 0) {
      keyword.lastIndex = i;
      const m = keyword.exec(src);
      if (!m) continue;
      const open = src.indexOf("{", keyword.lastIndex);
      if (open < 0) break;
      // The body's own level: what's inside it, less what's in braces
      // nested deeper (method bodies, nested types), each of which leaves a
      // ; so the members around it stay apart.
      let members = "";
      let close = src.length;
      for (let j = open + 1, d = 1; j < src.length; j++) {
        const c = src[j];
        if (c === "{") {
          if (d === 1) members += ";";
          d++;
        } else if (c === "}") {
          d--;
          if (d === 0) {
            close = j;
            break;
          }
          if (d === 1) members += ";";
        } else if (d === 1) members += c;
      }
      types.push({
        name: m[2],
        public: /\bpublic\b/.test(src.slice(declStart, i)),
        main: JAVA_MAIN.test(members),
      });
      i = close;
      declStart = close + 1;
    }
  }
  return types;
}

/** Which class a Java program starts from, when Java's single-file launcher
    (Piston's way) would get it wrong: the launcher runs the file's first
    top-level type, so a file whose main method sits further down (after a
    helper class, an interface, an enum, or a record, as other online
    compilers allow) gets its class to run and the file to compile it as
    (javac's rule: named for the public type). Null when the first type has
    main (the common case, left to the launcher) or nothing does (the
    launcher says so). */
export function javaEntry(code) {
  const types = javaTypes(code);
  if (!types.length || types[0].main) return null;
  const main = types.find((t) => t.main);
  if (!main) return null;
  const pkg = /^\s*package\s+([\w$.]+)\s*;/m.exec(javaCode(code))?.[1];
  return { run: pkg ? `${pkg}.${main.name}` : main.name, file: types.find((t) => t.public)?.name ?? NAMES.java };
}

/** The hint file Piston's Java run script reads (scripts/piston-extras/java/run). */
export const JAVA_ENTRY_FILE = "hu-java-entry";

/** The files a sandbox run sends: the program, and for Java whose main
    isn't in its first type, the hint naming what to run. */
export function sourceFiles(language, code) {
  const files = [{ name: sourceFileName(language, code), content: code }];
  const entry = language === "java" ? javaEntry(code) : null;
  if (entry) files.push({ name: JAVA_ENTRY_FILE, content: `${entry.run}\n${entry.file}\n` });
  return files;
}

/** The name to give the code's file. JavaScript that uses import or export
    runs as an ES module (main.mjs), anything else as CommonJS (main.js), so
    both `import fs from "fs"` and `require("fs")` work. */
export function sourceFileName(language, code) {
  if (language === "javascript") return isEsModule(code) ? "main.mjs" : "main.js";
  return NAMES[language];
}
