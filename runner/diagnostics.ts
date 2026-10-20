import type Docker from "dockerode";
import { execCollect } from "./exec.ts";

/**
 * On-save diagnostics (architecture §6.7, §3.3): a template's `diagnostics`
 * commands (`npx tsc --noEmit --pretty false`, `go vet ./...`, `shellcheck -f
 * gcc …`) run in the workspace a second after the last save, and their
 * output becomes `diag` events that feed the Problems panel and the editor's
 * squiggles. Each event replaces everything earlier from the same source.
 */

export interface DiagSpec {
  on: "save";
  cmd: string[];
  parser: string;
}

export interface DiagItem {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning" | "info";
  code?: string;
  message: string;
}

/** The template's save-time diagnostics that the runner can run, from whatever template.json holds. */
export function diagSpecs(raw: unknown[]): DiagSpec[] {
  const out: DiagSpec[] = [];
  for (const d of raw) {
    const spec = d as { on?: unknown; cmd?: unknown; parser?: unknown };
    if (spec?.on !== "save" || !Array.isArray(spec.cmd) || !spec.cmd.length || !spec.cmd.every((a) => typeof a === "string")) continue;
    out.push({ on: "save", cmd: spec.cmd as string[], parser: typeof spec.parser === "string" ? spec.parser : String(spec.cmd[0]) });
  }
  return out;
}

const clean = (file: string) => file.replace(/^\/workspace\//, "").replace(/^\.\//, "");

/** tsc: src/a.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'. */
function tsc(output: string): DiagItem[] {
  const items: DiagItem[] = [];
  const re = /^(.+?)\((\d+),(\d+)\): (error|warning|message) (TS\d+): (.*)$/;
  let last: DiagItem | null = null;
  for (const line of output.split("\n")) {
    const m = re.exec(line);
    if (m) {
      last = { file: clean(m[1]), line: Number(m[2]), col: Number(m[3]), severity: m[4] === "message" ? "info" : (m[4] as "error" | "warning"), code: m[5], message: m[6] };
      items.push(last);
    } else if (last && /^\s+\S/.test(line)) {
      // tsc continues a long message on indented lines.
      last.message += `\n${line.trim()}`;
    } else {
      last = null;
    }
  }
  return items;
}

/** The common file:line:col: severity: message form (go vet, ruff, shellcheck -f gcc, javac -Xdiags). */
function generic(output: string): DiagItem[] {
  const items: DiagItem[] = [];
  const re = /^(?:vet: )?([^\s:][^:]*):(\d+):(?:(\d+):)?\s*(?:(error|warning|note|info):\s*)?(.*)$/i;
  for (const line of output.split("\n")) {
    const m = re.exec(line.trim());
    if (!m || !m[5]) continue;
    const severity = (m[4] ?? "error").toLowerCase();
    const code = /\[(SC\d+|[A-Z]+\d+)\]$/.exec(m[5])?.[1];
    items.push({
      file: clean(m[1]),
      line: Number(m[2]),
      col: m[3] ? Number(m[3]) : 1,
      severity: severity === "warning" ? "warning" : severity === "note" || severity === "info" ? "info" : "error",
      ...(code ? { code } : {}),
      message: code ? m[5].replace(/\s*\[[^\]]+\]$/, "") : m[5],
    });
  }
  return items;
}

export function parseDiagnostics(parser: string, output: string): DiagItem[] {
  return (parser === "tsc" ? tsc(output) : generic(output)).slice(0, 500);
}

/** Runs one spec in the workspace and returns what it found. */
export async function runDiagnostics(container: Docker.Container, spec: DiagSpec): Promise<DiagItem[]> {
  const result = await execCollect(container, ["timeout", "-k", "2", "60", ...spec.cmd], {
    user: "learner",
    workDir: "/workspace",
    timeoutMs: 65_000,
    maxBytes: 1024 * 1024,
  });
  return parseDiagnostics(spec.parser, `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`);
}
