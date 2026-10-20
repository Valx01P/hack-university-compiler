// Values React Router hands to every middleware, loader, and action through their context
// argument. The QueryClient travels this way, so loaders fill the same cache the components read,
// and a test can give the router a fresh client of its own.
import type { QueryClient } from "@tanstack/react-query";
import { createContext, RouterContextProvider } from "react-router";

export const queryClientContext = createContext<QueryClient>();

export function createRouterContext(queryClient: QueryClient): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(queryClientContext, queryClient);
  return context;
}
