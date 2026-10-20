// Route functions of the task pages. taskLoader fills the cache with the task before
// /tasks/:taskId renders. quickAddAction handles the board's Quick add <Form method="post">, and
// deleteTaskAction handles the fetcher behind each card's Delete button: both return the
// server's field errors to the form, or refresh the cache so the board shows the change.
import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { queryClientContext } from "@/lib/router-context";
import { createTask, deleteTask, taskQueries } from "./api";
import { refreshProject } from "./cache";
import type { Task } from "./types";

export async function taskLoader({ params, context }: LoaderFunctionArgs) {
  const taskId = Number(params.taskId);
  if (!Number.isInteger(taskId) || taskId < 1) throw data("Task not found", { status: 404 });
  try {
    await context.get(queryClientContext).ensureQueryData(taskQueries.detail(taskId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data("Task not found", { status: 404 });
    throw error;
  }
  return null;
}

export type QuickAddResult = { created: Task } | { errors: Record<string, string> };

export async function quickAddAction({ request, params, context }: ActionFunctionArgs): Promise<QuickAddResult> {
  const projectId = Number(params.projectId);
  const formData = await request.formData();
  try {
    const created = await createTask(projectId, { title: String(formData.get("title") ?? "") });
    await refreshProject(context.get(queryClientContext), projectId);
    return { created };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { errors: error.fieldErrors };
    throw error;
  }
}

export type DeleteResult = { deleted: true } | { error: string };

export async function deleteTaskAction({ params, context }: ActionFunctionArgs): Promise<DeleteResult> {
  const taskId = Number(params.taskId);
  const queryClient = context.get(queryClientContext);
  try {
    await deleteTask(taskId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { error: "Only the project's owner can delete tasks." };
    throw error;
  }
  const task = queryClient.getQueryData<Task>(queryKeys.task(taskId));
  queryClient.removeQueries({ queryKey: queryKeys.task(taskId) });
  // The card's project: from the task's cache entry, or from any list that held the card.
  const projectId = task?.project_id ?? findProjectOf(queryClient.getQueriesData({ queryKey: ["projects"] }), taskId);
  if (projectId !== undefined) await refreshProject(queryClient, projectId);
  return { deleted: true };
}

function findProjectOf(entries: Array<[readonly unknown[], unknown]>, taskId: number): number | undefined {
  for (const [, page] of entries) {
    const items = (page as { items?: Task[] } | undefined)?.items;
    const task = items?.find((item) => item.id === taskId);
    if (task) return task.project_id;
  }
  return undefined;
}
