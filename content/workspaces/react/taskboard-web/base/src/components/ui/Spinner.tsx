// A small busy indicator. Its label is announced by screen readers through role="status".
import styles from "./Spinner.module.css";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span data-ui="spinner" role="status" className={styles.spinner}>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
