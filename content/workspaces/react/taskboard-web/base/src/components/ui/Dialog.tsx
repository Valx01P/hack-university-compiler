// A modal dialog on the native <dialog> element. showModal() gives focus trapping, Escape to
// close, an inert page behind, and focus returned to the opener, all from the browser. React
// controls it with the open prop: an effect calls showModal() or close() to match, and the
// dialog's close event (Escape, or close() itself) reports back through onClose.
import { clsx } from "clsx";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  className?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} data-ui="dialog" aria-labelledby={titleId} className={clsx(styles.dialog, className)} onClose={onClose}>
      {/* The content mounts only while open, so a form inside starts fresh every time. */}
      {open && (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}
