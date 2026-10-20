// The auth feature's public API: everything other code may import from it.
export { meQuery, type User } from "./api";
export { authMiddleware, requireRole, userContext } from "./auth-middleware";
export { LoginPage } from "./LoginPage";
export { safeNext } from "./safe-next";
export { redirectOnExpiredSession } from "./session-expiry";
export { useCurrentUser, useLogout } from "./use-current-user";
