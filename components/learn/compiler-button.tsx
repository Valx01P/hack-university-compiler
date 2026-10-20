"use client";

import { FolderCode, SquareTerminal } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

/** Back to this language's compiler, or for a course that has no compiler
    page (React, Spring Boot, and the other project courses), on to its
    playground. It asks first, like the compiler's Learn button. Learn's top
    bar has one, and so does the editor's tab row while full screen covers
    the top bar. */
export function CompilerButton({
  lang,
  langLabel,
  to = "compiler",
  className = "",
}: {
  lang: string;
  langLabel: string;
  to?: "compiler" | "playground";
  className?: string;
}) {
  const playground = to === "playground";
  return (
    <ConfirmButton
      tooltip={playground ? `Open the ${langLabel} playground` : `Back to the ${langLabel} compiler`}
      title={playground ? "Open the playground?" : "Back to the compiler?"}
      description={
        playground
          ? "A project with files, a terminal, and the course's codebases. Your lesson progress stays saved."
          : "Your lesson progress and the code in each part stay saved."
      }
      confirmLabel={playground ? "Open playground" : "Open compiler"}
      href={playground ? `/${lang}/playground` : `/${lang}`}
      className={`inline-flex items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-highlight hover:text-ink ${className}`}
    >
      {playground ? <FolderCode className="size-3.5" aria-hidden /> : <SquareTerminal className="size-3.5" aria-hidden />}
      {playground ? "Playground" : "Compiler"}
    </ConfirmButton>
  );
}
