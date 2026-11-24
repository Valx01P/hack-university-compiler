"use client";

import { CodeXml, SquareTerminal } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

/** Back to this language's compiler, or for a course that has no compiler
    page (React, Spring Boot, and the other project courses), on to the
    playground, the one folder on this computer for trying things. A course
    whose lessons run in another's compiler (Math, in Python's) opens that
    one, named, since it was never where you came from (`own` false). It
    asks first, like the compiler's Learn button. Learn's top
    bar has one, and so does the editor's tab row while full screen covers
    the top bar. */
export function CompilerButton({
  lang,
  langLabel,
  own = true,
  to = "compiler",
  className = "",
}: {
  /** The compiler's course and label. */
  lang: string;
  langLabel: string;
  /** Whether it's the course's own compiler. */
  own?: boolean;
  to?: "compiler" | "playground";
  className?: string;
}) {
  const playground = to === "playground";
  return (
    <ConfirmButton
      tooltip={playground ? "Open the playground" : own ? `Back to the ${langLabel} compiler` : `Open the ${langLabel} compiler`}
      title={playground ? "Open the playground?" : own ? "Back to the compiler?" : `Open the ${langLabel} compiler?`}
      description={
        playground
          ? "A folder on your computer with files and a terminal. Your lesson progress stays saved."
          : "Your lesson progress and the code in each part stay saved."
      }
      confirmLabel={playground ? "Open playground" : "Open compiler"}
      href={playground ? "/playground" : `/${lang}`}
      className={`inline-flex items-center gap-1.5 rounded-btn border border-content-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink ${className}`}
    >
      {playground ? <CodeXml className="size-3.5" aria-hidden /> : <SquareTerminal className="size-3.5" aria-hidden />}
      {playground ? "Playground" : own ? "Compiler" : `${langLabel} compiler`}
    </ConfirmButton>
  );
}
