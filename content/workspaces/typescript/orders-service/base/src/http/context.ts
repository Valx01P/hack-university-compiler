// What a route handler gets: the raw request and response, the typed path params, the query
// string, the request id, a logger that tags every line with that id, and readJson for the
// body. Params is a type parameter, so the router can tell each handler exactly which
// params its pattern has.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../logger.ts";

// A route without :params gets an object with no properties at all, so reading
// ctx.params.anything is a compile error.
export type NoParams = object;

export type RequestContext<Params = NoParams> = {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly params: Params;
  readonly query: URLSearchParams;
  readonly requestId: string;
  readonly log: Logger;
  /** The body parsed as JSON. It is unknown on purpose: check it with a schema first. */
  readonly readJson: () => Promise<unknown>;
};
