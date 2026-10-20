// A native <select>, which brings keyboard support and mobile pickers for free.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { useFieldControl } from "./field-context";
import styles from "./controls.module.css";

export function Select({ className, ...props }: ComponentProps<"select">) {
  const field = useFieldControl();
  return <select data-ui="select" className={clsx(styles.control, styles.select, className)} {...field} {...props} />;
}
