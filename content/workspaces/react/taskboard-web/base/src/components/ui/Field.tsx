// A form field: label, control, optional hint, and error. The error is linked to the control
// with aria-describedby and marks it aria-invalid, so screen readers announce it with the field.
import { clsx } from "clsx";
import { useId, type ReactNode } from "react";
import styles from "./Field.module.css";
import { FieldContext } from "./field-context";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div data-ui="field" className={clsx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <FieldContext value={{ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined }}>{children}</FieldContext>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
