// The main navigation: the app's sections and your projects. NavLink marks the current page with
// aria-current="page" and the active class. On small screens the root layout shows this inside a
// drawer and passes onNavigate, so following a link closes the drawer.
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { NavLink } from "react-router";
import { Skeleton } from "@/components/ui/Skeleton";
import { projectQueries } from "@/features/projects";
import styles from "./Sidebar.module.css";

const SECTIONS = [
  { to: "/projects", label: "Projects", end: true },
  { to: "/team", label: "Team", end: false },
  { to: "/settings", label: "Settings", end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) => clsx(styles.link, isActive && styles.active);

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const projects = useQuery(projectQueries.list());

  return (
    <nav aria-label="Main" className={styles.sidebar}>
      <p className={styles.brand}>{import.meta.env.VITE_APP_NAME}</p>
      <ul role="list" className={styles.links}>
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <NavLink to={section.to} end={section.end} className={linkClass} onClick={onNavigate}>
              {section.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <h2 className={styles.heading}>Your projects</h2>
      {projects.isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading projects">
          <Skeleton height="1.5rem" />
          <Skeleton height="1.5rem" />
        </div>
      ) : projects.isError ? (
        <p className={styles.note}>Couldn't load your projects.</p>
      ) : projects.data.length === 0 ? (
        <p className={styles.note}>None yet.</p>
      ) : (
        <ul role="list" className={styles.links}>
          {projects.data.map((project) => (
            <li key={project.id}>
              <NavLink to={`/projects/${project.id}`} className={linkClass} onClick={onNavigate}>
                <span className={styles.dot} style={{ background: project.color }} aria-hidden="true" />
                {project.name}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
