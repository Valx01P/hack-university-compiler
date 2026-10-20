// The session API: who is logged in (GET /v1/me), log in, and log out. The server keeps the
// session and the browser keeps an HttpOnly cookie that page scripts can't read, so the cached
// answer of meQuery is the app's only notion of "logged in".
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface User {
  id: number;
  email: string;
  name: string;
  /** The account's role. Project roles (owner, member) are on a project's members. */
  role: "admin" | "member";
  created_at: string;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: User;
}

export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => apiFetch<User>("/me", { signal }),
    staleTime: 5 * 60_000,
  });

export function login(credentials: { email: string; password: string }): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", { method: "POST", body: credentials });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}
