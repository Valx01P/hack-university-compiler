// Hooks for the session. useCurrentUser() returns the logged-in user to any component under the
// root layout, where authMiddleware has already loaded it. useLogout() ends the session.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout, meQuery, type User } from "./api";

export function useCurrentUser(): User {
  const { data } = useQuery(meQuery());
  if (!data) throw new Error("useCurrentUser() needs a route under authMiddleware, which loads the user first");
  return data;
}

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    try {
      await logout();
    } finally {
      // Leave first, then clear: the pages being left still read the user while they unmount.
      await navigate("/login", { replace: true });
      queryClient.clear();
    }
  };
}
