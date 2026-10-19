import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { sandboxStatus } from "@/lib/piston";
import { runnerStatus } from "@/lib/runner";

export const dynamic = "force-dynamic";

/** Sandbox health for the status badge in the shell: Piston and its
    installed runtimes, and the runner with what it says about Docker. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const [piston, runner] = await Promise.all([sandboxStatus(), runnerStatus()]);
  return NextResponse.json({ ...piston, runner }, {
    headers: { "Cache-Control": "no-store" },
  });
}
