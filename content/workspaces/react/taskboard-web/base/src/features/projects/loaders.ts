// The loader of /projects/:projectId. It runs when the navigation starts, before any component
// renders, and fills the cache with the project and the board's first page of tasks in parallel,
// so the page appears complete instead of as a row of spinners. A project you can't see, or one
// that doesn't exist, becomes a 404 response that the route's error boundary shows.
import { data, type LoaderFunctionArgs } from "react-router";
import { boardParams, parseTaskFilters, taskQueries } from "@/features/tasks/api";
import { ApiError } from "@/lib/api-client";
import { queryClientContext } from "@/lib/router-context";
import { projectQueries } from "./api";

export async function projectLoader({ params, request, context }: LoaderFunctionArgs) {
  const projectId = Number(params.projectId);
  if (!Number.isInteger(projectId) || projectId < 1) throw data("Project not found", { status: 404 });
  const queryClient = context.get(queryClientContext);
  const filters = parseTaskFilters(new URL(request.url).searchParams);
  try {
    await Promise.all([
      queryClient.ensureQueryData(projectQueries.detail(projectId)),
      queryClient.ensureQueryData(taskQueries.list(projectId, boardParams(filters))),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data("Project not found", { status: 404 });
    throw error;
  }
  return null;
}
