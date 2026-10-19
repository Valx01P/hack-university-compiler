"use client";

import { SquareTerminal } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

/** Back to this language's compiler. It asks first, like the compiler's
    Learn button. Learn's top bar has one, and so does the editor's tab row
    while full screen covers the top bar. */
export function CompilerButton({ lang, langLabel, className = "" }: { lang: string; langLabel: string; className?: string }) {
  return (
    <ConfirmButton
      tooltip={`Back to the ${langLabel} compiler`}
      title="Back to the compiler?"
      description="Your lesson progress and the code in each part stay saved."
      confirmLabel="Open compiler"
      href={`/${lang}`}
      className={`inline-flex items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink ${className}`}
    >
      <SquareTerminal className="size-3.5" aria-hidden />
      Compiler
    </ConfirmButton>
  );
}
