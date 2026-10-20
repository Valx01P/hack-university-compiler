// A small colored label for a priority, a status, or a task label. A tone picks a theme color; a
// color (a label's own #rrggbb) overrides it through a CSS variable.
import { clsx } from "clsx";
import type { CSSProperties, ReactNode } from "react";
import styles from "./Tag.module.css";

export type TagTone = "neutral" | "info" | "success" | "warning" | "danger";

interface TagProps {
  tone?: TagTone;
  color?: string;
  children: ReactNode;
}

export function Tag({ tone = "neutral", color, children }: TagProps) {
  const style = color ? ({ "--tag-color": color } as CSSProperties) : undefined;
  return (
    <span data-ui="tag" className={clsx(styles.tag, styles[tone], color && styles.custom)} style={style}>
      {children}
    </span>
  );
}
