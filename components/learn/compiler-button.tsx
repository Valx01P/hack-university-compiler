"use client";

import { FolderCode, SquareTerminal } from "lucide-react";
import { ConfirmLink } from "@/components/ui/confirm-link";

/** Back to this language's compiler, or for a course that has no compiler
    page (React, Spring Boot, and the other project courses), on to its
    playground. It asks with a second click (the first makes it glow), like
    the compiler's Learn button. Learn's top bar has one, and so does the
    editor's tab row while full screen covers the top bar. */
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
    <ConfirmLink
      href={playground ? `/${lang}/playground` : `/${lang}`}
      tooltip={
        playground
          ? `Open the ${langLabel} playground, a project with files, a terminal, and the course's codebases. Your lesson progress stays saved.`
          : `Back to the ${langLabel} compiler. Your lesson progress and the code in each part stay saved.`
      }
      armedLabel={playground ? "Click again to open the playground" : "Click again to open the compiler"}
      className={`inline-flex items-center gap-1.5 rounded-btn border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink ${className}`}
    >
      {playground ? <FolderCode className="size-3.5" aria-hidden /> : <SquareTerminal className="size-3.5" aria-hidden />}
      {playground ? "Playground" : "Compiler"}
    </ConfirmLink>
  );
}
