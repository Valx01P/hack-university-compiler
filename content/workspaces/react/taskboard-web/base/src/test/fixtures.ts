// Test data: the mock API's own seed (api/seed.json), typed as the client's types. Tests see the
// same users, projects, tasks, and comments the running app shows, with the same ids.
import seed from "../../api/seed.json";
import type { User } from "@/features/auth";
import type { ProjectRole } from "@/features/projects";
import type { Task } from "@/features/tasks";

export const PASSWORD = "correct horse battery staple";

export const USERS = { ada: 1, grace: 2, linus: 3, margaret: 4 } as const;
export type SeedUser = keyof typeof USERS;

export interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  color: string;
  owner_id: number;
  created_at: string;
}

export const fixtures = {
  users: seed.users.map(({ password: _password, ...user }) => user) as User[],
  projects: seed.projects as ProjectRow[],
  members: seed.project_members as Array<{ project_id: number; user_id: number; role: ProjectRole }>,
  /** Without labels: the handlers attach them from labels and taskLabels. */
  tasks: seed.tasks as Array<Omit<Task, "labels">>,
  comments: seed.comments,
  watchers: seed.task_watchers,
  labels: seed.labels,
  taskLabels: seed.task_labels,
};

export const taskById = (id: number) => fixtures.tasks.find((task) => task.id === id)!;
