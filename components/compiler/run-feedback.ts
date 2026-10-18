"use client";

import { useEffect, useRef } from "react";
import type { RunState } from "@/lib/run-code";

/** How a run ended, in one line for screen readers (the output is in the panel). */
export function runSummary(run: RunState): string {
  if (run.status === "error") return run.error;
  if (run.status !== "done") return "";
  if (run.compileCode != null && run.compileCode !== 0) return "Your code didn't compile.";
  if (run.verdict === "TO") return "Timed out. Your code ran too long.";
  if (run.verdict === "OL" || run.verdict === "EL") return "Output limit reached.";
  return run.signal ? `Run finished. Killed by ${run.signal}.` : `Run finished with exit code ${run.code ?? "unknown"}.`;
}

/**
 * Run and Check are disabled while a run is in flight, and disabling the
 * focused button drops keyboard focus to <body>. Call the returned function
 * from the button's click: when it was pressed from the keyboard, focus goes
 * back to it once `busy` turns false. Not if focus has moved somewhere else
 * since, and not after any click or tap during the run, which means you moved
 * on.
 */
export function useReturnFocus(busy: boolean) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (busy) {
      const forget = () => {
        ref.current = null;
      };
      document.addEventListener("pointerdown", forget, true);
      return () => document.removeEventListener("pointerdown", forget, true);
    }
    const el = ref.current;
    ref.current = null;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (el?.isConnected && lost) el.focus({ preventScroll: true });
  }, [busy]);

  return (e: React.MouseEvent<HTMLElement>) => {
    // A click with no pointer behind it (detail 0) is Enter or Space, or
    // assistive tech pressing the button.
    ref.current = e.detail === 0 && document.activeElement === e.currentTarget ? e.currentTarget : null;
  };
}
