import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { chosenComponents } from "@/lib/installed";
import { sandboxStatus } from "@/lib/piston";
import { runnerStatus } from "@/lib/runner";

export const dynamic = "force-dynamic";

/** Sandbox health for the status badge in the shell: Piston and its
    installed runtimes, the runner with what it says about Docker, and what
    was chosen at npm run up (so a stopped sandbox and a language that was
    never installed read differently). */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const [piston, runner] = await Promise.all([sandboxStatus(), runnerStatus()]);
  return NextResponse.json({ ...piston, runner, chosen: chosenComponents() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
