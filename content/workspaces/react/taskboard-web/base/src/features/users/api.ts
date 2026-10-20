// Finding people: GET /v1/users?q= returns up to 20 users whose name or email contains q, and
// everyone when q is empty. The key holds q, so each search is cached on its own and going back to
// an earlier search shows its results at once.
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface UserSummary {
  id: number;
  name: string;
  email: string;
}

export function usersQuery(q: string) {
  return queryOptions({
    queryKey: queryKeys.users(q),
    queryFn: ({ signal }) => apiFetch<UserSummary[]>(`/users${q ? `?${new URLSearchParams({ q })}` : ""}`, { signal }),
  });
}
