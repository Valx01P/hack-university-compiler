// Who watches a task: GET /v1/tasks/{task_id}/watchers, and PUT or DELETE
// /v1/tasks/{task_id}/watchers/{user_id} to watch or stop. A small finished feature, built the
// way the capstone asks you to build labels: types, a query, an optimistic mutation, UI, tests.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast-context";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface Watcher {
  id: number;
  name: string;
}

export function watchersQuery(taskId: number) {
  return queryOptions({
    queryKey: queryKeys.watchers(taskId),
    queryFn: ({ signal }) => apiFetch<Watcher[]>(`/tasks/${taskId}/watchers`, { signal }),
  });
}

export function watch(taskId: number, userId: number): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}/watchers/${userId}`, { method: "PUT" });
}

export function unwatch(taskId: number, userId: number): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}/watchers/${userId}`, { method: "DELETE" });
}

/** Watches or stops watching as `me`, updating the list at once and rolling back on failure. */
export function useToggleWatch(taskId: number, me: Watcher) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.watchers(taskId);

  return useMutation({
    mutationFn: (watching: boolean) => (watching ? watch(taskId, me.id) : unwatch(taskId, me.id)),
    onMutate: async (watching) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Watcher[]>(key);
      queryClient.setQueryData<Watcher[]>(key, (current = []) =>
        watching ? [...current.filter((w) => w.id !== me.id), me].toSorted((a, b) => a.id - b.id) : current.filter((w) => w.id !== me.id),
      );
      return { previous };
    },
    onError: (_error, _watching, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast("Couldn't change who watches this task", "danger");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
