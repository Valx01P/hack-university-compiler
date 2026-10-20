// The app's button. Features never style a raw <button>: they pick a variant and a size, so every
// button looks and behaves the same, and a design change happens here once.
import { clsx } from "clsx";
import type { ComponentProps } from "react";
import styles from "./Button.module.css";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", type = "button", className, ...props }: ButtonProps) {
  return <button data-ui="button" type={type} className={clsx(styles.button, styles[variant], size === "sm" && styles.small, className)} {...props} />;
}
