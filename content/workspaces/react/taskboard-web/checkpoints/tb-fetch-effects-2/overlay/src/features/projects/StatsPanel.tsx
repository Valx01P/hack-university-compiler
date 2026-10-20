// The Stats tab: how many of the project's tasks are in each status, fetched in an effect. A
// status union says what to show, the skeleton keeps the final size inside an aria-busy region,
// and Retry bumps reloadKey so the effect runs again. The cleanup aborts the request when the
// panel unmounts or the effect re-runs (Strict Mode runs it twice in development).
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import type { TaskCounts } from "./api";
import styles from "./StatsPanel.module.css";
import { useProjectId } from "./use-project-id";

const COUNTS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" },
] as const;

type StatsState = { status: "loading" } | { status: "error"; error: unknown } | { status: "success"; counts: TaskCounts };

export function StatsPanel({ projectId }: { projectId: number }) {
  const [state, setState] = useState<StatsState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<TaskCounts>(`/projects/${projectId}/stats`, { signal: controller.signal })
      .then((counts) => setState({ status: "success", counts }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [projectId, reloadKey]);

  function retry() {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }

  if (state.status === "error") return <ErrorState title="Couldn't load the stats" error={state.error} onRetry={retry} />;

  return (
    <section aria-label="Task counts" aria-busy={state.status === "loading"} className={styles.panel}>
      {COUNTS.map(({ key, label }) => (
        <div key={key} className={styles.count}>
          <p className={styles.label}>{label}</p>
          {state.status === "loading" ? <Skeleton width="3rem" height="2rem" /> : <p className={styles.value}>{state.counts[key]}</p>}
        </div>
      ))}
    </section>
  );
}

/** The route component of /projects/:projectId/stats. The key gives each project a fresh panel. */
export function ProjectStatsTab() {
  const projectId = useProjectId();
  return <StatsPanel key={projectId} projectId={projectId} />;
}
