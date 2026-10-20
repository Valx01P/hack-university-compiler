// /projects: the projects you belong to, as cards, and the New project button. Loading shows
// skeleton cards of the final size, an error offers Retry, and someone in no project (Margaret,
// in the seed) sees an empty state with the next step.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { projectQueries } from "./api";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectCard } from "./ProjectCard";
import styles from "./ProjectsPage.module.css";

export function ProjectsPage() {
  const projects = useQuery(projectQueries.list());
  const [creating, setCreating] = useState(false);

  return (
    <section className={styles.page} aria-labelledby="projects-heading">
      <title>Projects · Taskboard</title>
      <header className={styles.header}>
        <h1 id="projects-heading">Projects</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New project
        </Button>
      </header>

      {projects.isPending ? (
        <ul role="list" className={styles.grid} aria-busy="true" aria-label="Loading projects">
          {[1, 2, 3].map((n) => (
            <li key={n} className={styles.placeholder}>
              <Skeleton width="60%" height="1.25rem" />
              <Skeleton height="2.5rem" />
              <Skeleton width="40%" />
            </li>
          ))}
        </ul>
      ) : projects.isError ? (
        <ErrorState title="Couldn't load your projects" error={projects.error} onRetry={() => projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyState title="You're not in any projects yet" action={<Button onClick={() => setCreating(true)}>Create a project</Button>}>
          Create one, or ask a teammate to add you to theirs.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.grid}>
          {projects.data.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}
