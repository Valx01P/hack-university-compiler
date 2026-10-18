import { NextResponse } from "next/server";
import { getCompilerLang } from "@/lib/compiler";
import { rejectNonLocal } from "@/lib/local-request";
import { runCode, SandboxError } from "@/lib/piston";

const CODE_MAX_CHARS = 100_000;
const STDIN_MAX_CHARS = 100_000;

/**
 * Runs code in the local Piston sandbox. No accounts and no rate limits: the
 * server only listens on 127.0.0.1, and Piston's own limits (time, memory,
 * processes, output, no network) bound every run.
 */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const language = typeof body?.language === "string" ? body.language : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const stdin = typeof body?.stdin === "string" ? body.stdin : "";

  if (!getCompilerLang(language) || !code) {
    return NextResponse.json(
      { error: "language and code are required" },
      { status: 400 }
    );
  }
  if (code.length > CODE_MAX_CHARS) {
    return NextResponse.json({ error: "Code is too long." }, { status: 413 });
  }
  if (stdin.length > STDIN_MAX_CHARS) {
    return NextResponse.json({ error: "stdin is too long." }, { status: 413 });
  }

  try {
    const run = await runCode({ language, code, stdin });
    return NextResponse.json({ run });
  } catch (err) {
    if (err instanceof SandboxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("sandbox run failed:", err);
    return NextResponse.json(
      { error: "The sandbox hit an unexpected error. Try again." },
      { status: 500 }
    );
  }
}
