import type { ReactNode } from "react";
import { CodeCopyButton } from "@/components/ui/code-copy-button";

export function CopyableCodeBlock({
  code,
  children,
  className = "",
  preClassName,
}: {
  code: string;
  children?: ReactNode;
  className?: string;
  preClassName: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      <pre className={preClassName}>{children ?? code}</pre>
      <CodeCopyButton text={code} className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" />
    </div>
  );
}
