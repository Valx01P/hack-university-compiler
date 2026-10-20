"use client";

import { useEffect, useState } from "react";
import { Eye, EyeClosed } from "lucide-react";

/**
 * The editor's peek at the answer: a closed eye that opens to show the
 * solution in place of your code (your code is untouched, and the eye closes
 * back onto it). The first time on a page it asks first: one click makes the
 * button glow, and a second click within 3 seconds shows the answer. After
 * that, on the same page, it opens straight away. Leaving the page resets it.
 */
export function AnswerToggle({
  shown,
  unlocked,
  onShow,
  onHide,
  className = "",
}: {
  /** The answer is showing. */
  shown: boolean;
  /** Already confirmed once on this page, so no second click needed. */
  unlocked: boolean;
  onShow: () => void;
  onHide: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  function click() {
    if (shown) return onHide();
    if (unlocked || armed) {
      setArmed(false);
      return onShow();
    }
    setArmed(true);
  }

  const label = shown ? "Hide the answer" : armed ? "Click again to show the answer" : "Show the answer";
  return (
    <button
      type="button"
      onClick={click}
      onBlur={() => setArmed(false)}
      aria-pressed={shown}
      aria-label={label}
      title={label}
      className={`${className} ${armed ? "answer-armed" : ""} ${shown ? "bg-highlight text-ink" : ""}`}
    >
      {shown ? <Eye className="size-[18px]" aria-hidden /> : <EyeClosed className="size-[18px]" aria-hidden />}
    </button>
  );
}
