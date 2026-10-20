import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { runnerFetch, runnerSocketUrl } from "@/lib/runner";
import { TicketRequest } from "@/lib/workspace-schemas";
import { errorResponse, readBody, relay } from "@/lib/workspace-route";

export const dynamic = "force-dynamic";

/**
 * A ticket for one of the runner's WebSockets (architecture §3.3): POST
 * {workspace, kind: "events" | "term", sid?}. The runner answers 32 random
 * bytes, good once, for 30 seconds, bound to the workspace, the kind of
 * socket, and the terminal. The page sends it as the socket's first
 * message, never in a URL. Answers `{ticket, expiresAt, url}`, where url is
 * the runner's address for sockets (always 127.0.0.1, never localhost, so
 * the cookies previews set on localhost never ride along).
 */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  try {
    const body = await readBody(request, TicketRequest, 4096);
    const res = await runnerFetch("/v1/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 10_000,
    });
    if (!res.ok) return relay(res);
    const data = (await res.json()) as { ticket?: unknown; expiresAt?: unknown };
    return NextResponse.json({ ticket: data.ticket, expiresAt: data.expiresAt, url: runnerSocketUrl() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
