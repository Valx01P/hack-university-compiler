// The IDE's small libraries: .http files, quick open's fuzzy match, names
// and modes, Material icon lookups, file languages, and the starting trees.
//
//   node --import ./tests/ide/register.mjs --test tests/ide/lib.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { asCurl, parseHttpFile, resolveVariables, targetOf } from "../../lib/http-file.ts";
import { fuzzyScore } from "../../lib/fuzzy.ts";
import { formatBytes, modeString, nameProblem } from "../../lib/ide-names.ts";
import { fileIconClass, folderIconClass } from "../../lib/file-icons.ts";
import { fileLanguage } from "../../lib/workspace-types.ts";
import { checkpointLayers, layerTree, sortedEntries, treeHash } from "../../lib/workspace-layers.mjs";
import { parseScope, scopeForRoute, workspaceId } from "../../lib/workspace-id.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

const HTTP = `@host = http://localhost:{{$dotenv PORT}}
@user = ada@example.com

### Log in
# @name login
POST {{host}}/v1/auth/login HTTP/1.1
Content-Type: application/json

{"email": "{{user}}", "password": "correct horse battery staple"}

### Who am I
GET {{host}}/v1/me
Authorization: Bearer {{login.response.body.$.token}}

###
/healthz
`;

test(".http files: variables, names, requests, headers, and bodies", () => {
  const { variables, requests } = parseHttpFile(HTTP);
  assert.equal(variables.host, "http://localhost:{{$dotenv PORT}}");
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map((r) => [r.title, r.name, r.method, r.url, r.line]),
    [
      ["Log in", "login", "POST", "{{host}}/v1/auth/login", 6],
      ["Who am I", null, "GET", "{{host}}/v1/me", 12],
      ["GET /healthz", null, "GET", "/healthz", 16],
    ]
  );
  assert.deepEqual(requests[0].headers, [["Content-Type", "application/json"]]);
  assert.match(requests[0].body, /correct horse battery staple/);
});

test(".http files: values from the port, the file, and earlier responses", () => {
  const { variables, requests } = parseHttpFile(HTTP);
  const login = { status: 200, headers: { Location: "/v1/me" }, body: JSON.stringify({ token: "t0k", user: { id: 1 } }) };
  const url = resolveVariables(requests[1].url, variables, { login }, 24100);
  assert.equal(url, "http://localhost:24100/v1/me");
  assert.equal(resolveVariables(requests[1].headers[0][1], variables, { login }, 24100), "Bearer t0k");
  assert.equal(resolveVariables("{{login.response.body.$.user.id}} {{login.response.headers.location}}", {}, { login }, null), "1 /v1/me");
  assert.equal(resolveVariables("{{missing}}", {}, {}, null), "{{missing}}");
  assert.deepEqual(targetOf(url, null), { port: 24100, path: "/v1/me" });
  assert.deepEqual(targetOf("v1/me?x=1", 24101), { port: 24101, path: "/v1/me?x=1" });
});

test("copy as curl quotes for a shell", () => {
  assert.equal(
    asCurl("POST", "http://localhost:24100/x", { "Content-Type": "application/json" }, `{"a":"it's"}`),
    `curl -i -X POST -H 'Content-Type: application/json' --data-raw '{"a":"it'\\''s"}' 'http://localhost:24100/x'`
  );
});

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

test("the playground's starting tree: every file with its hash, folders first", () => {
  const layers = checkpointLayers(ROOT, "typescript", "playground", null);
  assert.deepEqual(layers, ["base"]);
  const tree = layerTree(ROOT, "typescript", "playground", layers);
  const entries = sortedEntries(tree);
  assert.equal(entries[0].path, "data");
  assert.ok(entries.some((e) => e.path === "src/main.ts" && e.type === "file" && /^[0-9a-f]{64}$/.test(e.sha256)));
  assert.match(treeHash(tree), /^[0-9a-f]{12}$/);
  assert.equal(treeHash(tree), treeHash(layerTree(ROOT, "typescript", "playground", layers)));
});

test("scopes: routes map to workspaces with the shared module", () => {
  assert.equal(scopeForRoute("/typescript/playground"), "playground/typescript");
  assert.equal(scopeForRoute("/typescript/playground/2"), "playground/typescript/2");
  assert.equal(scopeForRoute("/typescript/playground/orders-service"), "sandbox/typescript/orders-service");
  assert.equal(scopeForRoute("/typescript/learn/modules/2", { tab: "code" }), "learn/typescript/modules/2/practice");
  assert.deepEqual(parseScope("playground/typescript"), { kind: "playground", course: "typescript" });
  assert.match(workspaceId("playground/typescript"), /^w[a-z2-7]{10}$/);
});
