"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/ui/anchored-panel";

/**
 * The editor toolbar's reset (curly braces) and its confirm, shared by the
 * compiler and Learn mode. The confirm is a small dialog: focus moves to
 * Cancel when it opens, Tab cycles between Cancel and Reset, and Escape,
 * Cancel and Reset hand focus back to the button. A click outside just closes
 * it, so the click still does what you meant and the page stays put.
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
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // The confirm is placed (and so shown) a frame after it opens: move focus
  // into it then, starting on the safe choice.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let tries = 0;
    const focusCancel = () => {
      const el = cancelRef.current;
      el?.focus({ preventScroll: true });
      if (document.activeElement !== el && tries++ < 10) frame = requestAnimationFrame(focusCancel);
    };
    frame = requestAnimationFrame(focusCancel);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // A click outside, or Escape while focus is elsewhere: close, and leave
  // focus where it is.
  const dismiss = useCallback(() => setOpen(false), []);
  const closeAndRefocus = () => {
    setOpen(false);
    anchorRef.current?.focus({ preventScroll: true });
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeAndRefocus();
      return;
    }
    // Tab and Shift+Tab cycle between Cancel and Reset.
    if (e.key !== "Tab") return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={className}
      >
        {/* Curly braces: reset to the original definition. */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3" />
          <path d="M16 3c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" />
        </svg>
      </button>
      <AnchoredPanel
        anchorRef={anchorRef}
        open={open}
        onClose={dismiss}
        align="right"
        className="z-[130] w-60 rounded-card border border-edge bg-surface p-3 text-sm shadow-[var(--shadow-card)]"
      >
        <div id={id} role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} onKeyDown={onKeyDown}>
          <p id={`${id}-title`} className="font-medium text-ink">
            {title}
          </p>
          <p id={`${id}-desc`} className="mt-1 text-xs text-ink-muted">
            {description}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={closeAndRefocus}
              className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => {
                onReset();
                closeAndRefocus();
              }}
              className="rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad"
            >
              Reset
            </button>
          </div>
        </div>
      </AnchoredPanel>
    </>
  );
}
