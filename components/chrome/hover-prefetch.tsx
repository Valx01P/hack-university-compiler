"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Gets a page ready the moment you show you might open it: hovering,
 * focusing, or touching any in-app link, or a button that leads to a page
 * after a confirm (it carries the page in data-prefetch-href). Each address
 * is asked for at most once a minute.
 *
 * In a production build that's Next's prefetch (on top of the links it
 * already prefetches as they scroll into view), so the click is instant.
 * Next skips prefetching in development, where the slow part of opening a
 * page the first time is compiling it, so there it quietly requests the page
 * instead, which gets it compiled before you click.
 */
export function HoverPrefetch() {
  const router = useRouter();
  useEffect(() => {
    const asked = new Map<string, number>();
    const intent = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("a[href], [data-prefetch-href]") : null;
      if (!el) return;
      if (el instanceof HTMLAnchorElement && (el.target === "_blank" || el.hasAttribute("download"))) return;
      const raw = el.getAttribute("data-prefetch-href") ?? el.getAttribute("href") ?? "";
      // Only pages of this app: a path, not another site or a #fragment.
      if (!raw.startsWith("/") || raw.startsWith("//")) return;
      const href = raw.split("#")[0];
      if (!href || href === window.location.pathname) return;
      const now = Date.now();
      if (now - (asked.get(href) ?? 0) < 60_000) return;
      asked.set(href, now);
      if (process.env.NODE_ENV === "development") {
        void fetch(href, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }).catch(() => {});
      } else {
        router.prefetch(href);
      }
    };
    document.addEventListener("pointerover", intent, { passive: true });
    document.addEventListener("focusin", intent);
    document.addEventListener("touchstart", intent, { passive: true });
    return () => {
      document.removeEventListener("pointerover", intent);
      document.removeEventListener("focusin", intent);
      document.removeEventListener("touchstart", intent);
    };
  }, [router]);
  return null;
}
