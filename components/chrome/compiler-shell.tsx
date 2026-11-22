"use client";

import { HistoryArrows } from "@/components/chrome/history-arrows";
import { SandboxStatus } from "@/components/chrome/sandbox-status";

/**
 * The app shell around the compiler and the playground: one bordered panel
 * under the header with browser-style history arrows and, for a compiler,
 * the sandbox status on top, the page filling the rest edge-to-edge. On
 * desktop it's exactly one viewport tall. Languages switch from the rail
 * beside the editor. On these pages the header scrolls away with the page
 * instead of staying on top of it (globals.css, data-compiler-page).
 */
export function CompilerShell({
  lang,
  children,
}: {
  /** The compiler's language, whose sandbox the bar shows. The playground
      runs nothing itself, so it has none. */
  lang?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-compiler-page className="px-3 pt-2 pb-2 lg:h-[calc(100dvh_-_var(--header-h))] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface lg:h-full lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="-ml-1 flex items-center gap-0.5">
            <HistoryArrows />
          </span>
          {lang && <SandboxStatus lang={lang} />}
        </div>
        <div className="slim-scroll flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
          {children}
        </div>
      </section>
    </div>
  );
}
