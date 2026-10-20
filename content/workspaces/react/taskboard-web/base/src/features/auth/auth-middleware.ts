// Route middleware that guards the app. authMiddleware runs before the loaders of every route
// under the root layout: it makes sure the current user is known (from the cache, or GET /v1/me),
// puts them in the router context for loaders, and sends anonymous visitors to the login page with
// the page they wanted in ?next=. requireRole adds a check for one route, answering 403.
import { createContext, data, redirect, type MiddlewareFunction } from "react-router";
import { ApiError } from "@/lib/api-client";
import { queryClientContext } from "@/lib/router-context";
import { meQuery, type User } from "./api";

export const userContext = createContext<User>();

export const authMiddleware: MiddlewareFunction = async ({ request, context }) => {
  const queryClient = context.get(queryClientContext);
  try {
    context.set(userContext, await queryClient.ensureQueryData(meQuery()));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const { pathname, search } = new URL(request.url);
      throw redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
    }
    throw error;
  }
};

/** Only users with this account role may open the route. The API still checks every request. */
export function requireRole(role: User["role"]): MiddlewareFunction {
  return ({ context }) => {
    if (context.get(userContext).role !== role) {
      throw data("You don't have access to this page", { status: 403 });
    }
  };
}
