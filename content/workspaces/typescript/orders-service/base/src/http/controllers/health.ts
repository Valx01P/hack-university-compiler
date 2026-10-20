// GET /health: answers 200 while the server is up, for the workspace's Ports panel, load
// balancers, and the checks, which wait for it before they send anything else.
import type { RequestContext } from "../context.ts";
import { json } from "../respond.ts";

export function healthController() {
  return {
    check: (ctx: RequestContext) => {
      json(ctx.res, 200, { status: "ok" });
    },
  };
}
