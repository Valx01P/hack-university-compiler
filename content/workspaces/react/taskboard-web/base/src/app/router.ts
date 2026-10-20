// The app's one router, created once outside React. getContext gives every middleware, loader,
// and action this app's QueryClient, so loaders fill the same cache the components read.
import { createBrowserRouter } from "react-router";
import { createRouterContext } from "@/lib/router-context";
import { queryClient } from "./query-client";
import { routes } from "./routes";

export const router = createBrowserRouter(routes, {
  getContext: () => createRouterContext(queryClient),
});
