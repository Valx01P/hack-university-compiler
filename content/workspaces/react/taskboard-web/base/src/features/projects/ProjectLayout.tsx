// The frame around a project's pages: its name (which owners can rename), and tabs for the board,
// the list, the members, and the stats. The tabs are NavLinks, so the current one gets
// aria-current="page" and the active class, and each tab is a child route rendered in <Outlet>.
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import type { CSSProperties } from "react";
import { NavLink, Outlet } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { projectQueries, roleIn } from "./api";
import styles from "./ProjectLayout.module.css";
import { RenameProjectForm } from "./RenameProjectForm";
import { useProjectId } from "./use-project-id";

const TABS = [
  { to: ".", label: "Board", end: true },
  { to: "list", label: "List", end: false },
  { to: "members", label: "Members", end: false },
  { to: "stats", label: "Stats", end: false },
];

export function ProjectLayout() {
  const projectId = useProjectId();
  const user = useCurrentUser();
  const { data: project } = useQuery(projectQueries.detail(projectId));
  if (!project) return null;

  return (
    <div className={styles.layout} style={{ "--project-color": project.color } as CSSProperties}>
      <title>{`${project.name} · Taskboard`}</title>
      <header className={styles.header}>
        {roleIn(project, user.id) === "owner" ? <RenameProjectForm project={project} /> : <h1 className={styles.name}>{project.name}</h1>}
        {project.description && <p className={styles.description}>{project.description}</p>}
      </header>
      <nav aria-label="Project views" className={styles.tabs}>
        {TABS.map((tab) => (
          <NavLink key={tab.label} to={tab.to} end={tab.end} className={({ isActive }) => clsx(styles.tab, isActive && styles.active)}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
