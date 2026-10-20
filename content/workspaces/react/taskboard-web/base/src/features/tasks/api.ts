// Tasks on the wire and in the cache. taskQueries.list and taskQueries.detail describe each read
// (its key and its request); the functions below them change tasks. This file imports only lib/,
// so other features (a project's prefetch, the labels picker) may import it without pulling in
// any task components.
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STATUSES, type NewTask, type Task, type TaskChanges, type TaskFilters, type TaskListParams, type TaskPage, type TaskSort, type TaskStatus } from "./types";

export const DEFAULT_FILTERS: TaskFilters = { sort: "due", page: 1 };
export const PAGE_SIZE = 10;
const SORTS: readonly TaskSort[] = ["due", "priority", "title"];

/** Reads ?status=, ?assignee=, ?q=, ?label=, ?sort=, and ?page=, ignoring values that make no sense. */
export function parseTaskFilters(params: URLSearchParams): TaskFilters {
  const status = params.get("status");
  const assignee = params.get("assignee");
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  return {
    ...(STATUSES.includes(status as TaskStatus) && { status: status as TaskStatus }),
    ...(assignee === "none" && { assignee: "none" as const }),
    ...(assignee && /^[1-9]\d*$/.test(assignee) && { assignee: Number(assignee) }),
    ...(params.get("q") && { q: params.get("q")! }),
    ...(params.get("label") && { label: params.get("label")! }),
    sort: SORTS.includes(sort as TaskSort) ? (sort as TaskSort) : DEFAULT_FILTERS.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function filterParams(filters: TaskFilters): Pick<TaskListParams, "status" | "assignee_id" | "q" | "label"> {
  const q = filters.q?.trim() ?? "";
  return {
    ...(filters.status && { status: filters.status }),
    ...(filters.assignee !== undefined && { assignee_id: String(filters.assignee) }),
    // The API needs at least 2 characters to search, so one typed letter doesn't filter yet.
    ...(q.length >= 2 && { q }),
    ...(filters.label && { label: filters.label }),
  };
}

/** The board shows every matching task at once (100 is the API's largest page), by due date. */
export function boardParams(filters: TaskFilters): TaskListParams {
  return { ...filterParams(filters), sort: "due", order: "asc", limit: 100, offset: 0 };
}

/** The list shows one page at a time, sorted the way ?sort= says (priority: highest first). */
export function pageParams(filters: TaskFilters): TaskListParams {
  return {
    ...filterParams(filters),
    sort: filters.sort,
    order: filters.sort === "priority" ? "desc" : "asc",
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
  };
}

function toSearch(params: TaskListParams): string {
  return new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
}

export const taskQueries = {
  list: (projectId: number, params: TaskListParams) =>
    queryOptions({
      queryKey: queryKeys.taskList(projectId, params),
      queryFn: ({ signal }) => apiFetch<TaskPage>(`/projects/${projectId}/tasks?${toSearch(params)}`, { signal }),
    }),
  detail: (taskId: number) =>
    queryOptions({
      queryKey: queryKeys.task(taskId),
      queryFn: ({ signal }) => apiFetch<Task>(`/tasks/${taskId}`, { signal }),
    }),
};

export function createTask(projectId: number, input: NewTask): Promise<Task> {
  return apiFetch<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: input });
}

/** Sends the version the change is based on. If someone saved in between, the API answers 412. */
export function updateTask(task: Pick<Task, "id" | "version">, changes: TaskChanges): Promise<Task> {
  return apiFetch<Task>(`/tasks/${task.id}`, { method: "PATCH", body: changes, headers: { "If-Match": `"v${task.version}"` } });
}

export function transitionTask(taskId: number, to: TaskStatus): Promise<Task> {
  return apiFetch<Task>(`/tasks/${taskId}/transition`, { method: "POST", body: { to } });
}

export function deleteTask(taskId: number): Promise<void> {
  return apiFetch<void>(`/tasks/${taskId}`, { method: "DELETE" });
}
