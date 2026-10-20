// Rendering for tests, with everything the app has around it: a fresh QueryClient per test (no
// retries, so errors show at once), the app's providers, a memory router, <StrictMode>, and
// userEvent. renderWithProviders renders one component at a URL; renderApp renders the whole
// route tree, middleware and loaders included. `as` picks the logged-in seed user (null: nobody).
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ReactElement } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppProviders } from "@/app/providers";
import { createQueryClient } from "@/app/query-client";
import { routes } from "@/app/routes";
import { meQuery } from "@/features/auth";
import { createRouterContext } from "@/lib/router-context";
import { fixtures, USERS, type SeedUser } from "./fixtures";
import { signInAs } from "./handlers";

interface Options {
  /** The URL the router starts at. */
  route?: string;
  /** The route path the component renders at, so useParams works: "/projects/:projectId". */
  path?: string;
  as?: SeedUser | null;
}

function renderRouter(routeObjects: RouteObject[], route: string, as: SeedUser | null, seedSession: boolean) {
  const queryClient = createQueryClient({ retry: false });
  signInAs(as);
  if (seedSession && as !== null) queryClient.setQueryData(meQuery().queryKey, fixtures.users.find((u) => u.id === USERS[as])!);
  const router = createMemoryRouter(routeObjects, { initialEntries: [route], getContext: () => createRouterContext(queryClient) });
  const user = userEvent.setup();
  const result = render(
    <StrictMode>
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
  return { ...result, user, router, queryClient };
}

/** One component, at a URL, as a logged-in user (Ada unless `as` says otherwise). */
export function renderWithProviders(ui: ReactElement, { route = "/", path = "*", as = "ada" }: Options = {}) {
  return renderRouter([{ path, element: ui }], route, as, true);
}

/** The whole app at a URL. The session comes from the fake API, so `as: null` shows the login redirect. */
export function renderApp(route: string, { as = "ada" }: Pick<Options, "as"> = {}) {
  return renderRouter(routes, route, as, false);
}
