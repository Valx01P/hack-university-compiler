import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { runnerFetch } from "@/lib/runner";
import { OpenRequest } from "@/lib/workspace-schemas";
import { errorResponse, fail, readBody, relay } from "@/lib/workspace-route";
import { resolveScope, runnerOpenBody, ScopeError } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

/**
 * Opens a workspace: POST {scope}, where the scope says where it lives in the
 * app (a part's practice, an example, a challenge, a playground, a sandbox,
 * lib/workspace-id.mjs). The template, its layers, the image, and the tasks
 * come from content/ here, never from the request, and the runner gets them
 * as PUT /v1/workspaces/:id (architecture §3.5), which is idempotent: the
 * first open copies the starting files, a later one finds them. Answers the
 * runner's `{id, status, templateHash, updated, ports, tree, removed}`.
 * Opening never starts a container, takes a port, or builds an image.
 */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  try {
    const { scope } = await readBody(request, OpenRequest);
    let resolved;
    try {
      resolved = await resolveScope(scope);
    } catch (err) {
      if (err instanceof ScopeError) return fail(err.message, 404, "no_such_workspace");
      throw err;
    }
    const res = await runnerFetch(`/v1/workspaces/${resolved.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runnerOpenBody(resolved)),
    });
    if (!res.ok) return relay(res);
    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...data, id: resolved.id, scope }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
