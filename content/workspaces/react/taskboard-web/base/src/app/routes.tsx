// The route tree: which URL renders which page, what loads before it renders, and who may see it.
// It is exported on its own so tests can build a memory router from the same routes the app uses.
// /login is public. Everything else is under the root layout, whose authMiddleware sends anonymous
// visitors to /login?next=<where they were going>.
import { redirect, type RouteObject } from "react-router";
import { authMiddleware, LoginPage, requireRole, userContext } from "@/features/auth";
import { MembersPage, ProjectLayout, projectLoader, ProjectsPage, ProjectStatsTab } from "@/features/projects";
import { deleteTaskAction, EditTaskPage, quickAddAction, TaskBoard, TaskDetailPage, taskLoader, TaskList } from "@/features/tasks";
import { UserDirectory } from "@/features/users";
import { NotFound } from "./not-found";
import { AppLoading, RootLayout } from "./root-layout";
import { RouteError } from "./route-error";

export const routes: RouteObject[] = [
  { path: "/login", Component: LoginPage, ErrorBoundary: RouteError },
  {
    id: "root",
    path: "/",
    middleware: [authMiddleware],
    // The user authMiddleware loaded. Having a loader also makes the middleware run on the first page load.
    loader: ({ context }) => context.get(userContext),
    Component: RootLayout,
    HydrateFallback: AppLoading,
    ErrorBoundary: RouteError,
    children: [
      { index: true, loader: () => redirect("/projects") },
      { path: "projects", Component: ProjectsPage, ErrorBoundary: RouteError },
      {
        path: "projects/:projectId",
        loader: projectLoader,
        Component: ProjectLayout,
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: TaskBoard, action: quickAddAction },
          { path: "list", Component: TaskList },
          { path: "members", Component: MembersPage },
          { path: "stats", Component: ProjectStatsTab },
        ],
      },
      { path: "tasks/:taskId", loader: taskLoader, Component: TaskDetailPage, ErrorBoundary: RouteError },
      { path: "tasks/:taskId/edit", loader: taskLoader, Component: EditTaskPage, ErrorBoundary: RouteError },
      { path: "tasks/:taskId/delete", action: deleteTaskAction },
      { path: "team", Component: UserDirectory, ErrorBoundary: RouteError },
      {
        path: "settings",
        // Loaded on first visit, from its own chunk of the build. The function form of lazy keeps
        // its cache per router; the object form shares state between routers made from these
        // same route objects, which breaks the second router a test file creates.
        lazy: async () => ({ Component: (await import("@/features/settings")).SettingsPage }),
        ErrorBoundary: RouteError,
      },
      {
        path: "settings/danger",
        middleware: [requireRole("admin")],
        lazy: async () => ({ Component: (await import("@/features/settings")).DangerZone }),
        ErrorBoundary: RouteError,
      },
      { path: "*", Component: NotFound },
    ],
  },
];
