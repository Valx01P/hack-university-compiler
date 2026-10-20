// What happens when a session dies while the app is open (it expired, or the data was reset):
// the next request answers 401, and this handler clears the cached data and sends the user to log
// in again, back to the same page afterwards. main.tsx registers it once.
import type { QueryClient } from "@tanstack/react-query";
import { onUnauthorized } from "@/lib/api-client";
import { meQuery } from "./api";

export function redirectOnExpiredSession(queryClient: QueryClient, navigate: (to: string) => Promise<void>): () => void {
  return onUnauthorized(() => {
    // Nobody was logged in: on a first visit, authMiddleware already redirects.
    if (queryClient.getQueryData(meQuery().queryKey) === undefined) return;
    const here = window.location.pathname + window.location.search;
    // Leave the pages that need a user first, then forget the data, so nothing renders without it.
    void navigate(`/login?next=${encodeURIComponent(here)}`).then(() => queryClient.clear());
  });
}
