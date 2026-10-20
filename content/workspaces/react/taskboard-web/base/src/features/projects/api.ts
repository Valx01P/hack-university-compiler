// Projects on the wire and in the cache. projectQueries describes each read once (its key and its
// request) for useQuery, prefetchQuery, and loaders alike. The mutation hooks change a project and
// then tell the cache: a rename writes the server's answer straight into the project's entry and
// refreshes only the list, so the page never refetches what it was just told.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export type ProjectRole = "owner" | "member" | "viewer";

export interface TaskCounts {
  todo: number;
  doing: number;
  done: number;
}

/** A project as GET /v1/projects lists it: with your role and its task counts. */
export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  color: string;
  owner_id: number;
  role: ProjectRole;
  task_counts: TaskCounts;
  created_at: string;
}

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: ProjectRole;
}

/** A project as GET /v1/projects/{project_id} returns it: with its members, sorted by user id. */
export interface Project {
  id: number;
  name: string;
  description: string | null;
  color: string;
  owner_id: number;
  created_at: string;
  members: Member[];
}

export interface NewProject {
  name: string;
  description: string | null;
  color: string;
}

export const PROJECT_COLORS = [
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#9333ea", label: "Purple" },
  { value: "#f97316", label: "Orange" },
  { value: "#db2777", label: "Pink" },
  { value: "#64748b", label: "Slate" },
] as const;

export const projectQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.projects(),
      queryFn: ({ signal }) => apiFetch<ProjectSummary[]>("/projects", { signal }),
    }),
  detail: (projectId: number) =>
    queryOptions({
      queryKey: queryKeys.project(projectId),
      queryFn: ({ signal }) => apiFetch<Project>(`/projects/${projectId}`, { signal }),
    }),
  stats: (projectId: number) =>
    queryOptions({
      queryKey: queryKeys.projectStats(projectId),
      queryFn: ({ signal }) => apiFetch<TaskCounts>(`/projects/${projectId}/stats`, { signal }),
    }),
};

export function createProject(input: NewProject): Promise<Project> {
  return apiFetch<Project>("/projects", { method: "POST", body: input });
}

export function renameProject(projectId: number, name: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`, { method: "PATCH", body: { name } });
}

/** The user's role in the project, or null when they aren't a member. */
export function roleIn(project: Project, userId: number): ProjectRole | null {
  return project.members.find((m) => m.user_id === userId)?.role ?? null;
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.project(project.id), project);
      // exact: only the list. Without it, every key under ["projects"] (each project's tasks too) would refetch.
      return queryClient.invalidateQueries({ queryKey: queryKeys.projects(), exact: true });
    },
  });
}

export function useRenameProject(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameProject(projectId, name),
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.project(projectId), project);
      return queryClient.invalidateQueries({ queryKey: queryKeys.projects(), exact: true });
    },
  });
}
