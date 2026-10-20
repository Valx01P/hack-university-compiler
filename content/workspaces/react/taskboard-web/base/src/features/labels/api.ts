// Labels: the Taskboard contract's optional labels tier. A project has labels (GET and POST
// /v1/projects/{project_id}/labels), and a task carries up to 5 of them (PUT and DELETE
// /v1/tasks/{task_id}/labels/{label_id}). A backend without the tier answers 404 on these routes,
// so labelQueries.list returns null for "labels are off" and the UI hides every label control.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast-context";
import { refreshProject, restoreTask, snapshotTask, writeTask } from "@/features/tasks/cache";
import type { LabelRef, Task } from "@/features/tasks/types";
import { ApiError, apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface Label extends LabelRef {
  project_id: number;
  task_count: number;
}

export const labelQueries = {
  list: (projectId: number) =>
    queryOptions({
      queryKey: queryKeys.projectLabels(projectId),
      queryFn: async ({ signal }): Promise<Label[] | null> => {
        try {
          return await apiFetch<Label[]>(`/projects/${projectId}/labels`, { signal });
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      },
      staleTime: 5 * 60_000,
    }),
};

export function attachLabel(taskId: number, labelId: number): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}/labels/${labelId}`, { method: "PUT" });
}

export function detachLabel(taskId: number, labelId: number): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}/labels/${labelId}`, { method: "DELETE" });
}

const byName = (a: LabelRef, b: LabelRef) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id);

/** Puts a label on the task or takes it off, one request per toggle, changing every cached copy of the task at once. */
export function useToggleLabel(task: Task) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ label, on }: { label: LabelRef; on: boolean }) => (on ? attachLabel(task.id, label.id) : detachLabel(task.id, label.id)),
    onMutate: async ({ label, on }) => {
      const snapshot = await snapshotTask(queryClient, task);
      writeTask(queryClient, task, (current) => {
        const others = (current.labels ?? []).filter((l) => l.id !== label.id);
        const ref = { id: label.id, name: label.name, color: label.color };
        return { ...current, labels: on ? [...others, ref].toSorted(byName) : others };
      });
      return snapshot;
    },
    onError: (error, _variables, snapshot) => {
      if (snapshot) restoreTask(queryClient, snapshot);
      toast(error instanceof ApiError && error.status === 409 ? "A task can carry at most 5 labels" : "Couldn't change the labels", "danger");
    },
    onSettled: () =>
      Promise.all([
        refreshProject(queryClient, task.project_id),
        queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectLabels(task.project_id) }),
      ]),
  });
}
