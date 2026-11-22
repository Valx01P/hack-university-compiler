// The folders' small libraries: quick open's fuzzy match, names and modes,
// Material icon lookups, file languages, the starting trees, and scopes.
//
//   node --import ./tests/ide/register.mjs --test tests/ide/lib.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fuzzyScore } from "../../lib/fuzzy.ts";
import { formatBytes, modeString, nameProblem } from "../../lib/ide-names.ts";
import { fileIconClass, folderIconClass } from "../../lib/file-icons.ts";
import { fileLanguage } from "../../lib/workspace-types.ts";
import { checkpointLayers, layerTree, sortedEntries, treeHash } from "../../lib/workspace-layers.mjs";
import { isScope, parseScope, workspaceId } from "../../lib/workspace-id.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("quick open matches letters in order, names and starts first", () => {
  assert.equal(fuzzyScore("src/main.ts", "xyz"), -1);
  const files = ["src/models/account.ts", "src/main.ts", "test/main.test.ts", "README.md"];
  const ranked = files.filter((f) => fuzzyScore(f, "main") >= 0).sort((a, b) => fuzzyScore(b, "main") - fuzzyScore(a, "main"));
  assert.equal(ranked[0], "src/main.ts");
  assert.ok(fuzzyScore("src/models/account.ts", "sma") >= 0);
});

test("names: what the explorer refuses, and modes and sizes", () => {
  const taken = (p) => p === "src/main.ts";
  assert.equal(nameProblem("main.ts", taken, "src"), "main.ts already exists here.");
  assert.equal(nameProblem("a/../b", taken, ""), "A name can't be empty, . or ..");
  assert.equal(nameProblem("  ", taken, ""), "Give it a name.");
  assert.equal(nameProblem("a\\b", taken, ""), "Use / between folders, not \\.");
  assert.equal(nameProblem("/etc", taken, ""), "Names start inside the workspace, without a leading /.");
  assert.equal(nameProblem("models/user.ts", taken, "src"), null);
  assert.equal(modeString(0o755), "rwxr-xr-x");
  assert.equal(modeString(0o644), "rw-r--r--");
  assert.equal(formatBytes(1130), "1.1 KB");
});

test("Material icons: whole names, then the longest extension, folders, and light variants", () => {
  assert.equal(fileIconClass("package.json"), "fi fi-nodejs");
  assert.equal(fileIconClass("tsconfig.json"), "fi fi-tsconfig");
  assert.equal(fileIconClass("greet.test.ts"), "fi fi-test-ts");
  assert.equal(fileIconClass("types.d.ts"), "fi fi-typescript-def");
  assert.equal(fileIconClass("README.md"), "fi fi-readme");
  assert.equal(fileIconClass(".env"), "fi fi-tune");
  assert.equal(fileIconClass("requests.http"), "fi fi-http");
  assert.equal(fileIconClass("next.config.ts"), "fi fi-next fl-next_light");
  assert.equal(fileIconClass("no-extension-here"), "fi fi-file");
  assert.equal(folderIconClass("src", false), "fi fi-folder-src");
  assert.equal(folderIconClass("src", true), "fi fi-folder-src-open");
  assert.equal(folderIconClass("internal", false), "fi fi-folder-private");
  assert.equal(folderIconClass("whatever", false), "fi fi-folder");
});

test("file languages for the editor and the tokenizer", () => {
  const cases = {
    "src/a.ts": "typescript",
    "App.tsx": "tsx",
    "package.json": "json",
    "README.md": "markdown",
    "compose.yaml": "yaml",
    ".env": "env",
    ".env.local": "env",
    Dockerfile: "dockerfile",
    Makefile: "makefile",
    "requests.http": "http",
    "styles.css": "css",
    "deploy.sh": "bash",
    "notes.txt": "text",
  };
  for (const [file, language] of Object.entries(cases)) assert.equal(fileLanguage(file), language, file);
});

test("the playground's starting tree: every file with its hash, the notes hidden in it", () => {
  const layers = checkpointLayers(ROOT, "playground", "blank", null);
  assert.deepEqual(layers, ["base"]);
  const tree = layerTree(ROOT, "playground", "blank", layers);
  const entries = sortedEntries(tree);
  assert.deepEqual(entries.map((e) => e.path).sort(), ["AGENTS.md", "CLAUDE.md", "README.md"]);
  assert.ok(entries.every((e) => e.type === "file" && /^[0-9a-f]{64}$/.test(e.sha256)));
  assert.match(treeHash(tree), /^[0-9a-f]{12}$/);
  assert.equal(treeHash(tree), treeHash(layerTree(ROOT, "playground", "blank", layers)));
});

test("scopes: a compiler's own folder and the one playground, nothing else", () => {
  assert.deepEqual(parseScope("playground"), { kind: "playground", course: "playground" });
  assert.deepEqual(parseScope("compiler/python"), { kind: "compiler", course: "python" });
  for (const old of ["playground/typescript", "playground/typescript/2", "sandbox/typescript/orders-service", "learn/typescript/modules/2/practice", "challenge/python/two-sum", "compiler/Python", ""]) {
    assert.equal(isScope(old), false, old);
  }
  // The compilers' folders keep their ids (and their tmux sessions, hu-<id>).
  assert.equal(workspaceId("compiler/python"), "wxkudhw5lug");
  assert.match(workspaceId("playground"), /^w[a-z2-7]{10}$/);
});
