// What a section shows when its data failed to load: what went wrong, and a way to try again.
// role="alert" makes screen readers announce it as soon as it appears.
import { ApiError } from "@/lib/api-client";
import { Button } from "./Button";
import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  title: string;
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  const detail = error instanceof ApiError ? `The server answered ${error.status} ${error.title}.` : "Check your connection and try again.";
  return (
    <div data-ui="error-state" role="alert" className={styles.errorState}>
      <p className={styles.title}>{title}</p>
      <p className={styles.detail}>{detail}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
