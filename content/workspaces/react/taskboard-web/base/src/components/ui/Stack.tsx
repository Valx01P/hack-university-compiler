// Vertical rhythm without margins: children stack with a gap from the spacing scale.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import styles from "./Stack.module.css";

type StackProps = ComponentProps<"div"> & { gap?: 2 | 3 | 4 | 5 };

export function Stack({ gap = 4, className, ...props }: StackProps) {
  return <div data-ui="stack" className={clsx(styles.stack, styles[`gap${gap}`], className)} {...props} />;
}

/** A row of buttons at the end of a form or dialog. */
export function Actions({ className, ...props }: ComponentProps<"div">) {
  return <div data-ui="actions" className={clsx(styles.actions, className)} {...props} />;
}
