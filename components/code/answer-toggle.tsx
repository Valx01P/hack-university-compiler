"use client";

import { Eye, EyeClosed } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

/**
 * The editor's peek at the answer: a closed eye that opens to show the
 * solution in place of your code (your code is untouched, and the eye closes
 * back onto it). The first time on a page it asks first, with the same
 * confirm as the Learn and Compiler buttons, except that clicking the eye
 * again cancels. After that, on the same page, it opens straight away.
 * Leaving the page resets it.
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
  /** Already confirmed once on this page, so it doesn't ask again. */
  unlocked: boolean;
  onShow: () => void;
  onHide: () => void;
  className?: string;
}) {
  return (
    <ConfirmButton
      ask={!shown && !unlocked}
      pressed={shown}
      title="Show the answer?"
      description="Your code is kept."
      confirmLabel="Show answer"
      onConfirm={shown ? onHide : onShow}
      label={shown ? "Hide the answer" : "Show the answer"}
      className={`${className} ${shown ? "bg-raised text-ink" : ""}`}
    >
      {shown ? <Eye className="size-[18px]" aria-hidden /> : <EyeClosed className="size-[18px]" aria-hidden />}
    </ConfirmButton>
  );
}
