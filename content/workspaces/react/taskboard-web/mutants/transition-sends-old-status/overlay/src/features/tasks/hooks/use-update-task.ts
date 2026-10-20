// The mutations that change a task. Status and priority changes are optimistic: the card moves or
// its tag changes at once, a failure puts it back and says so in a toast, and either way the lists
// refetch afterwards so they end up exactly as the server has them. Editing text is not
// optimistic: the form waits for the server, which may answer 412 when someone else saved first.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast-context";
import { queryKeys } from "@/lib/query-keys";
import { transitionTask, updateTask } from "../api";
import { refreshProject, restoreTask, snapshotTask, writeTask } from "../cache";
import type { Priority, Task, TaskChanges, TaskStatus } from "../types";

export function useTransitionTask() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ task }: { task: Task; to: TaskStatus }) => transitionTask(task.id, task.status),
    onMutate: async ({ task, to }) => {
      const snapshot = await snapshotTask(queryClient, task);
      writeTask(queryClient, task, (current) => ({ ...current, status: to }));
      return snapshot;
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot) restoreTask(queryClient, snapshot);
      toast("Couldn't move the task. It's back where it was.", "danger");
    },
    onSuccess: (saved) => writeTask(queryClient, saved, () => saved),
    onSettled: (_data, _error, { task }) => refreshProject(queryClient, task.project_id),
  });
}

export function useUpdatePriority() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ task, priority }: { task: Task; priority: Priority }) => updateTask(task, { priority }),
    onMutate: async ({ task, priority }) => {
      const snapshot = await snapshotTask(queryClient, task);
      writeTask(queryClient, task, (current) => ({ ...current, priority }));
      return snapshot;
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot) restoreTask(queryClient, snapshot);
      toast("Couldn't change the priority", "danger");
    },
    onSuccess: (saved) => writeTask(queryClient, saved, () => saved),
    onSettled: (_data, _error, { task }) => refreshProject(queryClient, task.project_id),
  });
}

/** Title, description, due date, or assignee. Callers handle a 412 (someone saved in between). */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ task, changes }: { task: Task; changes: TaskChanges }) => updateTask(task, changes),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.task(saved.id), saved);
      writeTask(queryClient, saved, () => saved);
      return refreshProject(queryClient, saved.project_id);
    },
  });
}
