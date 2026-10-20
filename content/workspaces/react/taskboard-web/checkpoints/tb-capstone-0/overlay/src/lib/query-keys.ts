// Every TanStack Query cache key in one place. A key holds everything its request depends on, and
// keys nest, so invalidating ["projects", 1, "tasks"] refreshes every task list of project 1,
// whatever its filters. Features build their queries from these, and a feature that changes
// another feature's data (a label on a task) finds the keys to update here.
import type { TaskListParams } from "@/features/tasks/types";

export const queryKeys = {
  me: () => ["me"] as const,
  users: (q: string) => ["users", { q }] as const,
  projects: () => ["projects"] as const,
  project: (projectId: number) => ["projects", projectId] as const,
  projectStats: (projectId: number) => ["projects", projectId, "stats"] as const,
  projectTasks: (projectId: number) => ["projects", projectId, "tasks"] as const,
  taskList: (projectId: number, params: TaskListParams) => ["projects", projectId, "tasks", params] as const,
  task: (taskId: number) => ["tasks", taskId] as const,
  comments: (taskId: number) => ["tasks", taskId, "comments"] as const,
  watchers: (taskId: number) => ["tasks", taskId, "watchers"] as const,
};
