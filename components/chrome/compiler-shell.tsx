"use client";

import { HistoryArrows } from "@/components/chrome/history-arrows";
import { SandboxStatus } from "@/components/chrome/sandbox-status";

/**
 * The app shell around the compiler: one bordered panel under the header with
 * browser-style history arrows and the sandbox status on top, the compiler
 * filling the rest edge-to-edge. On desktop it's exactly one viewport tall.
 * Languages switch from the rail beside the editor.
 */
export function CompilerShell({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface lg:h-full lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="-ml-1 flex items-center gap-0.5">
            <HistoryArrows />
          </span>
          <SandboxStatus lang={lang} />
        </div>
        <div className="slim-scroll flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
          {children}
        </div>
      </section>
    </div>
  );
}
