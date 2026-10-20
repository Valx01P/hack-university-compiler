"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/ui/anchored-panel";

const CONFIRM =
  "rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad";

/**
 * A button that asks first: a small confirm card drops down under it, the
 * same kind of panel as the editor settings. Focus moves to Cancel when it
 * opens, Tab cycles between Cancel and the confirm, and Escape and Cancel
 * hand focus back to the button. A click outside just closes it, so the click
 * still does what you meant and the page stays put. With `confirmAgain` (the
 * default for a confirm that goes somewhere, like Learn or Compiler), clicking
 * the button again while it's open confirms, so Cancel or a click outside is
 * how it closes.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  href,
  label,
  tooltip,
  align = "right",
  confirmAgain = href !== undefined,
  className,
  children,
}: {
  /** The confirm's question. */
  title: string;
  description: string;
  /** Text of the confirming button. */
  confirmLabel: string;
  /** Runs when you confirm. */
  onConfirm?: () => void;
  /** Confirming follows this link instead (a real link, so it prefetches). */
  href?: string;
  /** Accessible name, for a button that shows only an icon. */
  label?: string;
  /** Tooltip, when it should differ from `label`. */
  tooltip?: string;
  /** Which edge of the button the confirm lines up with. */
  align?: "left" | "right";
  /** Clicking the button again while it's open confirms, instead of closing
      it. On by default for a link (`href`), off for an action. */
  confirmAgain?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLElement | null>(null);
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
    // Tab and Shift+Tab cycle between Cancel and the confirm.
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

  const setConfirm = (el: HTMLElement | null) => {
    confirmRef.current = el;
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          if (!open) return setOpen(true);
          if (!confirmAgain) return setOpen(false);
          // The second click confirms, like the confirm button.
          onConfirm?.();
          setOpen(false);
          if (href) router.push(href);
        }}
        aria-label={label}
        title={tooltip ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Where confirming goes, so hovering here already prefetches it.
        data-prefetch-href={href}
        aria-controls={open ? id : undefined}
        className={className}
      >
        {children}
      </button>
      <AnchoredPanel
        anchorRef={anchorRef}
        open={open}
        onClose={dismiss}
        align={align}
        className="z-[150] w-60 rounded-card border border-edge bg-surface p-3 text-sm shadow-[var(--shadow-card)]"
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
              className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink"
            >
              Cancel
            </button>
            {href ? (
              <Link
                ref={setConfirm}
                href={href}
                onClick={() => {
                  onConfirm?.();
                  setOpen(false);
                }}
                className={CONFIRM}
              >
                {confirmLabel}
              </Link>
            ) : (
              <button
                ref={setConfirm}
                type="button"
                onClick={() => {
                  onConfirm?.();
                  closeAndRefocus();
                }}
                className={CONFIRM}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        </div>
      </AnchoredPanel>
    </>
  );
}
