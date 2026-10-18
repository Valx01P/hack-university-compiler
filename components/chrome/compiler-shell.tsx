"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LanguageMenu } from "@/components/chrome/language-menu";
import { SandboxStatus } from "@/components/chrome/sandbox-status";

/**
 * The app shell around the compiler: one bordered panel under the header with
 * the language menu and browser-style history arrows on top, the compiler
 * filling the rest edge-to-edge. On desktop it's exactly one viewport tall.
 */
export function CompilerShell({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  // Whether a back/forward history entry actually exists, via the Navigation
  // API (Chromium). Browsers without it can't know, so leave both enabled.
  const [hist, setHist] = useState({ back: true, fwd: true });

  // No currententrychange listener: Next dispatches it from an insertion
  // effect, where scheduling React updates is illegal. Every navigation
  // changes pathname, so a pathname-keyed effect reads the same state safely
  // after commit.
  useEffect(() => {
    const nav = (window as unknown as { navigation?: { canGoBack: boolean; canGoForward: boolean } }).navigation;
    if (!nav) return;
    setHist({ back: nav.canGoBack, fwd: nav.canGoForward });
  }, [pathname]);

  return (
    <div className="px-3 pt-2 pb-2 lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-card border border-edge bg-surface lg:h-full lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
          <span className="flex items-center gap-0.5">
            <LanguageMenu active={lang} />
            <span className="ml-1 flex items-center">
              <button
                type="button"
                onClick={() => router.back()}
                disabled={!hist.back}
                aria-label="Go back"
                title={hist.back ? "Go back" : "Nothing to go back to"}
                className="inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => router.forward()}
                disabled={!hist.fwd}
                aria-label="Go forward"
                title={hist.fwd ? "Go forward" : "Nothing to go forward to"}
                className="inline-flex size-7 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </span>
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
