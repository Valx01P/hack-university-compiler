// The TanStack Query client: the cache of server data for the whole app. Data counts as fresh for
// 30 seconds (no refetch when another component asks), refetches when you come back to the tab,
// and a failed request is retried once, unless the server said 4xx, which a retry won't fix.
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

const isClientError = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500;

/** Tests pass retry: false, so a failing request fails at once instead of after a retry delay. */
export function createQueryClient({ retry = true }: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: retry ? (failureCount, error) => failureCount < 1 && !isClientError(error) : false,
      },
    },
  });
}

export const queryClient = createQueryClient();
