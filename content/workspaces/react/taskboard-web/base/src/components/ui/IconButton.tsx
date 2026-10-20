// A button that shows only an icon. Its label is required and becomes the accessible name,
// because an icon alone tells a screen reader nothing.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import styles from "./IconButton.module.css";

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & { label: string };

export function IconButton({ label, type = "button", className, children, ...props }: IconButtonProps) {
  return (
    <button data-ui="icon-button" type={type} aria-label={label} title={label} className={clsx(styles.iconButton, className)} {...props}>
      {children}
    </button>
  );
}
