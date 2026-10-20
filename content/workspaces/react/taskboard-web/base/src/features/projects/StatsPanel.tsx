// The Stats tab: how many of the project's tasks are in each status, from
// GET /v1/projects/{project_id}/stats. While loading it shows skeletons of the final size inside an
// aria-busy region, and an error offers Retry.
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { projectQueries } from "./api";
import styles from "./StatsPanel.module.css";
import { useProjectId } from "./use-project-id";

const COUNTS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" },
] as const;

export function StatsPanel({ projectId }: { projectId: number }) {
  const stats = useQuery(projectQueries.stats(projectId));

  if (stats.isError) return <ErrorState title="Couldn't load the stats" error={stats.error} onRetry={() => stats.refetch()} />;

  return (
    <section aria-label="Task counts" aria-busy={stats.isPending} className={styles.panel}>
      {COUNTS.map(({ key, label }) => (
        <div key={key} className={styles.count}>
          <p className={styles.label}>{label}</p>
          {stats.isPending ? <Skeleton width="3rem" height="2rem" /> : <p className={styles.value}>{stats.data[key]}</p>}
        </div>
      ))}
    </section>
  );
}

/** The route component of /projects/:projectId/stats. */
export function ProjectStatsTab() {
  return <StatsPanel projectId={useProjectId()} />;
}
