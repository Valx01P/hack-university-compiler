import RUNTIMES from "@/lib/runtimes.json";
import { getCompilerLang } from "@/lib/compiler";

/**
 * Server-side client for the local Piston sandbox (docker-compose.yml). Only
 * the route handlers import this. Piston has no auth of its own, which is why
 * it binds to 127.0.0.1 and the browser never talks to it directly.
 */
const PISTON_URL = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");

// Piston enforces the run/compile limits set in docker-compose.yml, so the
// request only has to outlast them: compile (60s) + run (10s) + slack.
const REQUEST_TIMEOUT_MS = 90_000;

// TypeScript on Piston ships without @types/node, so tsc rejects `require`,
// `process`, etc. Append an ambient shim: `declare` statements are hoisted and
// file-scoped, so this satisfies the type-checker without shifting any of the
// user's line numbers.
const TS_NODE_SHIM =
  "\n// --- ambient Node shim for TypeScript (no @types/node) ---\n" +
  "declare const require: (m: string) => any;\n" +
  "declare const process: any;\n" +
  "declare const Buffer: any;\n" +
  "declare const __dirname: string;\n";

type LanguageId = keyof typeof RUNTIMES;

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** Set when the process was killed (time, output, or memory limit). */
  signal: string | null;
  /** isolate's verdict: "TO" timed out, "OL"/"EL" stdout/stderr too large. */
  status: string | null;
  /** Compile phase (compiled languages only); null when there wasn't one. */
  compileCode: number | null;
  /** Compiler stdout + stderr. tsc and dotnet print their errors to stdout. */
  compileOutput: string;
}

export interface SandboxStatus {
  online: boolean;
  /** Language id -> the runtime serving it, e.g. javascript -> node 20.11.1. */
  runtimes: Record<string, { name: string; version: string }>;
}

/** A failure the UI shows as-is, plus the HTTP status to answer with. */
export class SandboxError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function isLanguageId(id: string): id is LanguageId {
  return Object.hasOwn(RUNTIMES, id);
}

/** dotnet wraps C# compiler errors in MSBuild chatter (template setup,
    restore, a summary that repeats every error). Keep just the diagnostics,
    once each, without the project-path suffix. */
function dotnetDiagnostics(output: string): string {
  const lines = output
    .split("\n")
    .filter((l) => /: (error|warning) [A-Z]+\d+:/.test(l))
    .map((l) =>
      l
        .replace(/\s*\[[^\]]*\.csproj\]\s*$/, "")
        .replace(/^\/box\/submission\//, "")
        .trim()
    );
  return lines.length ? [...new Set(lines)].join("\n") : output;
}

/** Numeric, dot-wise version compare (Piston picks the newest on "*"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function runCode({
  language,
  code,
  stdin,
}: {
  language: string;
  code: string;
  stdin: string;
}): Promise<RunResult> {
  if (!isLanguageId(language)) {
    throw new SandboxError(`Unsupported language "${language}".`, 400);
  }
  const label = getCompilerLang(language)?.label ?? language;
  const source = language === "typescript" ? code + TS_NODE_SHIM : code;

  let res: Response;
  try {
    res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: RUNTIMES[language].runtime,
        version: "*",
        files: [{ content: source }],
        stdin,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new SandboxError("The sandbox took too long to answer. Try again.", 504);
    }
    throw new SandboxError(
      "The local sandbox isn't running. Start it with npm run piston:up, then run again.",
      503
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Piston answers 400 "<runtime>-* runtime is unknown" for a language whose
    // package was never installed.
    const message = typeof data?.message === "string" ? data.message : "";
    if (/runtime is unknown/i.test(message)) {
      throw new SandboxError(
        `${label} isn't installed in the local sandbox yet. Install it with npm run piston:install -- ${language}, then run again.`,
        409
      );
    }
    throw new SandboxError(message || `The sandbox returned an error (${res.status}).`, 502);
  }

  const status: string | null = data?.run?.status ?? null;
  let stderr: string = data?.run?.stderr ?? "";
  // Hitting the output cap aborts isolate's keeper process, which leaves its
  // own line in stderr. The UI already says the output limit was reached.
  if (status === "OL" || status === "EL") {
    stderr = stderr.replace(/^Sandbox keeper received fatal signal \d+\n?/m, "");
  }
  const compileCode: number | null = data?.compile ? (data.compile.code ?? null) : null;
  let compileOutput: string = data?.compile?.output ?? "";
  if (compileCode) {
    // Piston's compile scripts (gcc, rust, haskell) chmod the output binary
    // even when the compiler failed, which tacks a confusing "chmod: cannot
    // access 'a.out'" line onto the real errors.
    compileOutput = compileOutput
      .replace(/^chmod: cannot access '[^']+': No such file or directory\n?/gm, "")
      .replace(/^\n+/, "");
    if (language === "csharp") compileOutput = dotnetDiagnostics(compileOutput);
  }

  return {
    stdout: data?.run?.stdout ?? "",
    stderr,
    code: data?.run?.code ?? null,
    signal: data?.run?.signal ?? null,
    status,
    compileCode,
    compileOutput,
  };
}

/** Whether Piston is up, and which runtime serves each language. */
export async function sandboxStatus(): Promise<SandboxStatus> {
  try {
    const res = await fetch(`${PISTON_URL}/runtimes`, {
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!res.ok) return { online: false, runtimes: {} };
    const list: { language: string; version: string; runtime?: string }[] = await res.json();
    const runtimes: SandboxStatus["runtimes"] = {};
    for (const [id, { runtime }] of Object.entries(RUNTIMES)) {
      const newest = list
        .filter((r) => r.language === runtime)
        .sort((a, b) => compareVersions(b.version, a.version))[0];
      if (newest) runtimes[id] = { name: newest.runtime ?? newest.language, version: newest.version };
    }
    return { online: true, runtimes };
  } catch {
    return { online: false, runtimes: {} };
  }
}
