// Toasts: short messages about something that just happened ("Task deleted", "Couldn't change the
// priority"). They live in one polite live region, so screen readers announce each one without
// interrupting, and each disappears after 5 seconds or when dismissed.
import { clsx } from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";
import { ToastContext, type ToastTone } from "./toast-context";

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_MS = 5000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function show(message: string, tone: ToastTone = "info") {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, tone }]);
  }

  function dismiss(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return (
    <ToastContext value={show}>
      {children}
      <div role="status" aria-live="polite" className={styles.viewport}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div data-ui="toast" className={clsx(styles.toast, styles[toast.tone])}>
      <p>{toast.message}</p>
      <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
