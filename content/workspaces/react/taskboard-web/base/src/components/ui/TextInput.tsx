// A text input. Inside a Field it takes the field's id and error wiring from context.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { useFieldControl } from "./field-context";
import styles from "./controls.module.css";

export function TextInput({ className, type = "text", ...props }: ComponentProps<"input">) {
  const field = useFieldControl();
  return <input data-ui="text-input" type={type} className={clsx(styles.control, className)} {...field} {...props} />;
}
