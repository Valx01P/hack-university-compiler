// Declaration merging: the properties this app's middleware adds to Express's Request.
import type { AuthUser } from "../http/auth.ts";

declare global {
  namespace Express {
    interface Request {
      /** Set by requestId() for every request: the client's X-Request-Id or a new UUID. */
      requestId: string;
      /** Set by requireAuth and optionalAuth when a valid access token came with the request. */
      user?: AuthUser;
    }
  }
}

export {};
