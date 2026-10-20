// Helpers that keep every cached copy of a task in step. A task lives in its own detail entry and
// in each list of its project (the board, every page and filter of the list view), so a change,
// optimistic or confirmed, writes all of them at once and can be rolled back from a snapshot.
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Task, TaskPage } from "./types";

export interface TaskSnapshot {
  entries: Array<[QueryKey, unknown]>;
}

/** Stops in-flight refetches (they would overwrite an optimistic change), then remembers every copy. */
export async function snapshotTask(queryClient: QueryClient, task: Pick<Task, "id" | "project_id">): Promise<TaskSnapshot> {
  const lists = { queryKey: queryKeys.projectTasks(task.project_id) };
  const detail = { queryKey: queryKeys.task(task.id), exact: true };
  await Promise.all([queryClient.cancelQueries(lists), queryClient.cancelQueries(detail)]);
  return { entries: [...queryClient.getQueriesData(lists), ...queryClient.getQueriesData(detail)] };
}

export function restoreTask(queryClient: QueryClient, snapshot: TaskSnapshot): void {
  for (const [key, data] of snapshot.entries) queryClient.setQueryData(key, data);
}

/** Applies change to the task in its detail entry and in every list of its project. */
export function writeTask(queryClient: QueryClient, task: Pick<Task, "id" | "project_id">, change: (task: Task) => Task): void {
  queryClient.setQueriesData<TaskPage>({ queryKey: queryKeys.projectTasks(task.project_id) }, (page) =>
    page ? { ...page, items: page.items.map((item) => (item.id === task.id ? change(item) : item)) } : page,
  );
  queryClient.setQueryData<Task>(queryKeys.task(task.id), (current) => (current ? change(current) : current));
}

/** After a change: the lists, the counts, and the projects page refetch in the background. */
export function refreshProject(queryClient: QueryClient, projectId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.projectStats(projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.projects(), exact: true }),
  ]);
}
