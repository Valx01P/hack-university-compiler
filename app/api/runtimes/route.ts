import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { sandboxStatus } from "@/lib/piston";

export const dynamic = "force-dynamic";

/** Sandbox health + installed runtimes, for the status badge in the shell. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return NextResponse.json(await sandboxStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
