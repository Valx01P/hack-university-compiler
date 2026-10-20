// Tasks as the API sends them. Names stay in the wire's snake_case (due_on, assignee_id), as many
// teams do with Go and Python backends, so a field reads the same in the code, the network panel,
// and the API docs. Priority travels as 1 to 3 and renders as Low, Medium, and High.
export type TaskStatus = "todo" | "doing" | "done";
export type Priority = 1 | 2 | 3;

export const STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };

export const PRIORITIES: readonly Priority[] = [3, 2, 1];

export const PRIORITY_LABELS: Record<Priority, string> = { 1: "Low", 2: "Medium", 3: "High" };

/** A label on a task, as the API's optional labels tier sends it. */
export interface LabelRef {
  id: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_on: string | null;
  assignee_id: number | null;
  version: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Present only when the backend serves the labels tier. */
  labels?: LabelRef[];
}

export interface TaskPage {
  items: Task[];
  total: number;
  limit: number;
  offset: number;
}

export interface NewTask {
  title: string;
  description?: string | null;
  priority?: Priority;
  due_on?: string | null;
  assignee_id?: number | null;
}

/** Fields PATCH /v1/tasks/{task_id} may change. Status changes go through transition instead. */
export type TaskChanges = Partial<Pick<Task, "title" | "description" | "priority" | "due_on" | "assignee_id">>;

export type TaskSort = "due" | "priority" | "title";

/** The filters in the URL: ?status=todo&assignee=2&q=login&label=bug&sort=priority&page=2. */
export interface TaskFilters {
  status?: TaskStatus;
  assignee?: number | "none";
  q?: string;
  label?: string;
  sort: TaskSort;
  page: number;
}

/** The query parameters of GET /v1/projects/{project_id}/tasks, and with the project id, its cache key. */
export interface TaskListParams {
  status?: TaskStatus;
  assignee_id?: string;
  q?: string;
  label?: string;
  sort: "due" | "priority" | "title" | "created";
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

/** The API's rule: todo and doing move anywhere, and done only moves back to doing. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from !== to && !(from === "done" && to === "todo");
}
