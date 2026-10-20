// A small typed router on node:http. A route is a method and a pattern such as
// "/orders/:id", and ExtractParams turns the pattern's text into the type of ctx.params at
// compile time, so ctx.params.id is a string and ctx.params.orderId is an error. An unknown
// path answers 404, and a known path with the wrong method answers 405 with an Allow header.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../logger.ts";
import type { NoParams, RequestContext } from "./context.ts";
import { HttpError } from "./errors.ts";
import { readJsonBody } from "./middleware.ts";

/** "/orders/:id/lines/:line" becomes { readonly id: string } & { readonly line: string }. */
export type ExtractParams<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { readonly [K in Name]: string } & ExtractParams<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? { readonly [K in Name]: string }
    : NoParams;

export type Handler<Params> = (ctx: RequestContext<Params>) => Promise<void> | void;

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Base = { readonly req: IncomingMessage; readonly res: ServerResponse; readonly requestId: string; readonly log: Logger };

type Route = {
  readonly method: Method;
  readonly regex: RegExp;
  readonly names: readonly string[];
  readonly invoke: (base: Base, query: URLSearchParams, params: Readonly<Record<string, string>>) => Promise<void> | void;
};

/** A path segment as text ("%20" becomes a space). A broken escape is the client's mistake: 400. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new HttpError(400, `The path has a broken escape: ${segment}`);
  }
}

export type Router = ReturnType<typeof createRouter>;

export function createRouter() {
  const routes: Route[] = [];

  function add<P extends string>(method: Method, pattern: P, handler: Handler<ExtractParams<P>>): void {
    const names: string[] = [];
    const source = pattern.replace(/:(\w+)/g, (_match, name: string) => {
      names.push(name);
      return "([^/]+)";
    });
    routes.push({
      method,
      regex: new RegExp(`^${source}$`),
      names,
      // The regex only matches when every :name captured a segment, so params holds exactly
      // the keys ExtractParams<P> promises. TypeScript cannot follow a regex, which is why
      // this is the one place that asserts a type instead of proving it.
      invoke: (base, query, params) =>
        handler({ ...base, query, params: params as ExtractParams<P>, readJson: () => readJsonBody(base.req) }),
    });
  }

  return {
    get: <P extends string>(pattern: P, handler: Handler<ExtractParams<P>>) => {
      add("GET", pattern, handler);
    },
    post: <P extends string>(pattern: P, handler: Handler<ExtractParams<P>>) => {
      add("POST", pattern, handler);
    },
    patch: <P extends string>(pattern: P, handler: Handler<ExtractParams<P>>) => {
      add("PATCH", pattern, handler);
    },
    delete: <P extends string>(pattern: P, handler: Handler<ExtractParams<P>>) => {
      add("DELETE", pattern, handler);
    },
    /** Finds the route for the request and runs it, or throws HttpError 404 or 405. */
    handle: async (base: Base): Promise<void> => {
      const url = new URL(base.req.url ?? "/", "http://localhost");
      const matches = routes.filter((route) => route.regex.test(url.pathname));
      if (matches.length === 0) throw new HttpError(404, `No route for ${url.pathname}`);
      const route = matches.find((candidate) => candidate.method === base.req.method);
      if (!route) {
        const allow = matches.map((candidate) => candidate.method).join(", ");
        throw new HttpError(405, `${String(base.req.method)} is not allowed on ${url.pathname}`, { headers: { allow } });
      }
      const values = route.regex.exec(url.pathname)?.slice(1) ?? [];
      const params = Object.fromEntries(route.names.map((name, i) => [name, decodeSegment(values[i] ?? "")]));
      await route.invoke(base, url.searchParams, params);
    },
  };
}
