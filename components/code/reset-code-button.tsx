"use client";

import { ConfirmButton } from "@/components/ui/confirm-button";

/**
 * The editor toolbar's reset (curly braces) and its confirm, shared by the
 * compiler and Learn mode.
 */
export function ResetCodeButton({
  label,
  title,
  description,
  onReset,
  className,
}: {
  /** The button's name and tooltip. */
  label: string;
  /** The confirm's question. */
  title: string;
  description: string;
  onReset: () => void;
  className: string;
}) {
  return (
    <ConfirmButton
      label={label}
      title={title}
      description={description}
      confirmLabel="Reset"
      onConfirm={onReset}
      className={className}
    >
      {/* Curly braces: reset to the original definition. */}
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3" />
        <path d="M16 3c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" />
      </svg>
    </ConfirmButton>
  );
}
