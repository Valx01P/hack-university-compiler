"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

type NavigationLike = { canGoBack: boolean; canGoForward: boolean };
const navigation = () => (window as unknown as { navigation?: NavigationLike }).navigation;

const ARROW =
  "inline-flex items-center justify-center text-ink-faint transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint";

/**
 * Browser-style back and forward arrows, each enabled only when there is a
 * page that way (Navigation API; browsers without it get both enabled).
 *
 * They never flash a wrong state. The server can't know your history, so it
 * renders both disabled, and the pre-paint bootstrap in app/layout.tsx marks
 * <html> with the arrows that work so the first paint already shows them
 * right (see globals.css). After that, a layout effect reads the history on
 * every navigation before the page paints. Next updates the history in an
 * insertion effect of the same commit, so it is current by then (and a
 * currententrychange listener would fire inside that insertion effect, where
 * React updates aren't allowed). `round` is the floating look, for full
 * screen (components/chrome/floating-nav.tsx).
 */
export function HistoryArrows({ round = false }: { round?: boolean } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hist, setHist] = useState({ back: false, fwd: false });
  const arrow = `${ARROW} ${round ? "size-8 rounded-full" : "size-7 rounded-btn"}`;

  useLayoutEffect(() => {
    const nav = navigation();
    setHist(nav ? { back: nav.canGoBack, fwd: nav.canGoForward } : { back: true, fwd: true });
    // React has the real state now: drop the first-paint hints.
    document.documentElement.removeAttribute("data-hist-back");
    document.documentElement.removeAttribute("data-hist-fwd");
  }, [pathname]);

  return (
    <span className="flex items-center">
      <button
        type="button"
        data-hist="back"
        onClick={() => router.back()}
        disabled={!hist.back}
        aria-label="Go back"
        title="Go back"
        className={arrow}
      >
        <ArrowLeft className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        data-hist="fwd"
        onClick={() => router.forward()}
        disabled={!hist.fwd}
        aria-label="Go forward"
        title="Go forward"
        className={arrow}
      >
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </span>
  );
}
