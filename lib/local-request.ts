import { NextResponse } from "next/server";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const forbidden = (error: string) => NextResponse.json({ error }, { status: 403 });

/**
 * The API routes only answer this app's own pages on this machine. The npm
 * scripts bind the server to 127.0.0.1, so nothing else on the network can
 * connect. This closes the browser-side gaps: another site's page posting
 * here (Origin mismatch), a DNS-rebinding trick that points some other
 * hostname at 127.0.0.1 (Host isn't loopback), and a page on another
 * localhost port, like a lesson's live preview, which is the same site but
 * not the same origin (the browser's Sec-Fetch-Site says so). Writes must
 * also carry `X-HU: 1`: a page elsewhere can only add that header after a
 * CORS preflight, which this app never grants. Returns the rejection to
 * send, or null when the request is fine.
 */
export function rejectNonLocal(request: Request): NextResponse | null {
  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) return forbidden("The compiler only accepts requests on localhost.");
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      /* malformed Origin */
    }
    if (!sameOrigin) return forbidden("Cross-origin requests are not allowed.");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return forbidden("Cross-origin requests are not allowed.");
  if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("x-hu") !== "1") {
    return forbidden("Requests that change something need the app's X-HU header.");
  }
  return null;
}
