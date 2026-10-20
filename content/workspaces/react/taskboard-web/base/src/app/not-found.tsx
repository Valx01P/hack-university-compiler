// The page for a URL that matches nothing, and for a project or task that doesn't exist (the
// route error boundary passes the loader's message as the title).
import { Link } from "react-router";
import styles from "./route-error.module.css";

export function NotFound({ title = "Page not found" }: { title?: string }) {
  return (
    <section className={styles.page} aria-labelledby="not-found-heading">
      <title>{`${title} · Taskboard`}</title>
      <h1 id="not-found-heading">{title}</h1>
      <p>It may have been deleted, or the link may be wrong.</p>
      <Link to="/projects">Back to projects</Link>
    </section>
  );
}
