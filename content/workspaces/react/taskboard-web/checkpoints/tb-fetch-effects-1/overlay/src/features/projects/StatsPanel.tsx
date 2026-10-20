// The Stats tab: how many of the project's tasks are in each status.
// TODO (lesson 30, part 1): fetch GET /v1/projects/{project_id}/stats with apiFetch in an effect,
// and show a skeleton marked aria-busy="true" while it loads, the error with a Retry button when
// it fails, and the three counts (To do, Doing, Done) when it arrives.
import { useProjectId } from "./use-project-id";

export function StatsPanel({ projectId }: { projectId: number }) {
  return (
    <section aria-label="Task counts">
      <p>{`The counts for project ${projectId} go here.`}</p>
    </section>
  );
}

/** The route component of /projects/:projectId/stats. The key gives each project a fresh panel. */
export function ProjectStatsTab() {
  const projectId = useProjectId();
  return <StatsPanel key={projectId} projectId={projectId} />;
}
