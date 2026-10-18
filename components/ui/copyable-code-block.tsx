import type { ReactNode } from "react";
import { CodeCopyButton } from "@/components/ui/code-copy-button";
import { ScrollPre } from "@/components/ui/scroll-pre";

export function CopyableCodeBlock({
  code,
  children,
  className = "",
  preClassName,
  label = "Code",
}: {
  code: string;
  children?: ReactNode;
  className?: string;
  preClassName: string;
  /** Names the block for the keyboard when the code is too wide to show. */
  label?: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      <ScrollPre label={label} text={code} className={preClassName}>
        {children ?? code}
      </ScrollPre>
      <CodeCopyButton text={code} className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" />
    </div>
  );
}
