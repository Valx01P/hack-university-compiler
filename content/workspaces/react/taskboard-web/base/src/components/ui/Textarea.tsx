// A multi-line text input.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { useFieldControl } from "./field-context";
import styles from "./controls.module.css";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  const field = useFieldControl();
  return <textarea data-ui="textarea" rows={rows} className={clsx(styles.control, styles.textarea, className)} {...field} {...props} />;
}
