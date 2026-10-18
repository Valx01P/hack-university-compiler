import { NextResponse } from "next/server";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The sandbox endpoints only answer this app's own pages on this machine. The
 * npm scripts bind the server to 127.0.0.1, so nothing else on the network
 * can connect. This closes the browser-side gaps: another site's page posting
 * here (Origin mismatch), or a DNS-rebinding trick that points some other
 * hostname at 127.0.0.1 (Host isn't loopback). Returns the rejection to send,
 * or null when the request is fine.
 */
export function rejectNonLocal(request: Request): NextResponse | null {
  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return NextResponse.json(
      { error: "The compiler only accepts requests on localhost." },
      { status: 403 }
    );
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      /* malformed Origin */
    }
    if (!sameOrigin) {
      return NextResponse.json(
        { error: "Cross-origin requests are not allowed." },
        { status: 403 }
      );
    }
  }
  return null;
}
