// One project on the projects page. Hovering the card or focusing its link prefetches the board's
// tasks, so by the time the click lands the board is usually in the cache already. A second hover
// within the 30-second staleTime sends nothing.
import { useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { boardParams, DEFAULT_FILTERS, taskQueries } from "@/features/tasks/api";
import type { ProjectSummary } from "./api";
import styles from "./ProjectCard.module.css";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const headingId = `project-${project.id}-name`;

  function prefetchBoard() {
    void queryClient.prefetchQuery(taskQueries.list(project.id, boardParams(DEFAULT_FILTERS)));
  }

  return (
    <article className={styles.card} aria-labelledby={headingId} style={{ "--project-color": project.color } as CSSProperties} onMouseEnter={prefetchBoard}>
      <h2 id={headingId} className={styles.name}>
        <Link to={`/projects/${project.id}`} onFocus={prefetchBoard}>
          {project.name}
        </Link>
      </h2>
      {project.description && <p className={styles.description}>{project.description}</p>}
      <dl className={styles.counts}>
        <div>
          <dt>To do</dt>
          <dd>{project.task_counts.todo}</dd>
        </div>
        <div>
          <dt>Doing</dt>
          <dd>{project.task_counts.doing}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{project.task_counts.done}</dd>
        </div>
      </dl>
      <p className={styles.role}>{project.role === "owner" ? "You own this project" : "You're a member"}</p>
    </article>
  );
}
