import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagSpecs, parseDiagnostics } from "./diagnostics.ts";

describe("diagnostics", () => {
  it("parse tsc's output, multi-line messages included", () => {
    const out = [
      "src/greet.ts(2,3): error TS2322: Type 'number' is not assignable to type 'string'.",
      "src/main.ts(10,1): error TS2345: Argument of type '{ kind: string; }' is not assignable to parameter of type 'Payment'.",
      "  Property 'last4' is missing in type '{ kind: string; }'.",
      "",
    ].join("\n");
    assert.deepEqual(parseDiagnostics("tsc", out), [
      { file: "src/greet.ts", line: 2, col: 3, severity: "error", code: "TS2322", message: "Type 'number' is not assignable to type 'string'." },
      {
        file: "src/main.ts",
        line: 10,
        col: 1,
        severity: "error",
        code: "TS2345",
        message: "Argument of type '{ kind: string; }' is not assignable to parameter of type 'Payment'.\nProperty 'last4' is missing in type '{ kind: string; }'.",
      },
    ]);
  });

  it("parse the file:line:col form of go vet and shellcheck", () => {
    assert.deepEqual(parseDiagnostics("go", "# app\nvet: ./internal/api/tasks.go:41:2: unreachable code\n"), [
      { file: "internal/api/tasks.go", line: 41, col: 2, severity: "error", message: "unreachable code" },
    ]);
    assert.deepEqual(parseDiagnostics("shellcheck", "deploy.sh:3:6: warning: Double quote to prevent globbing. [SC2086]\n"), [
      { file: "deploy.sh", line: 3, col: 6, severity: "warning", code: "SC2086", message: "Double quote to prevent globbing." },
    ]);
  });

  it("keep only save-time commands from template.json", () => {
    assert.deepEqual(diagSpecs([{ on: "save", cmd: ["npx", "tsc"], parser: "tsc" }, { on: "open", cmd: ["x"] }, { on: "save", cmd: "bad" }]), [
      { on: "save", cmd: ["npx", "tsc"], parser: "tsc" },
    ]);
  });
});
