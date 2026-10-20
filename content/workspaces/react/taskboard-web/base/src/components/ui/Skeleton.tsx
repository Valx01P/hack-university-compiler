// A gray placeholder with the size of the content it stands in for, so the layout doesn't jump
// when the content arrives. Hidden from screen readers: the busy region around it says "loading".
import styles from "./Skeleton.module.css";

export function Skeleton({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <span data-ui="skeleton" aria-hidden="true" className={styles.skeleton} style={{ width, height }} />;
}
