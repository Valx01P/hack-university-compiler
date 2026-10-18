"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { LangIcon } from "@/components/compiler/lang-icon";
import { COMPILER_GROUPS, getCompilerLang } from "@/lib/compiler";

/**
 * The language picker: a hover dropdown listing every compiler, grouped by
 * family. Opens on hover (or click/focus). The menu is rendered through a
 * portal and fixed-positioned under the trigger, so it never gets clipped by
 * the panel's `overflow-hidden` and never shifts the surrounding layout.
 */
export function LanguageMenu({ active }: { active: string }) {
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When hover/focus last opened the menu. A click right after (the same
  // pointer gesture) must not toggle it straight back closed.
  const openedAt = useRef(0);

  // Close when the route changes (a language was chosen).
  useEffect(() => setOpen(false), [pathname]);

  const openMenu = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Clamp so the wide panel never runs off the right edge.
      const width = Math.min(608, window.innerWidth * 0.94);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 6, left });
    }
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Generous grace period: drifting off the panel for a moment shouldn't
    // slam it shut (pair with the invisible hover margin around the panel).
    closeTimer.current = setTimeout(() => setOpen(false), 320);
  };

  // A scroll or resize invalidates the fixed position, so just close. Escape
  // closes too.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onFocus={openMenu}
        onBlur={scheduleClose}
        onClick={() =>
          open && Date.now() - openedAt.current > 400 ? setOpen(false) : openMenu()
        }
        className="flex shrink-0 items-center gap-1.5 rounded-btn text-xs font-medium uppercase tracking-wider text-ink-faint transition-colors hover:text-ink"
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Menu
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            // Invisible hover buffer around the visible panel: hovering a
            // little off the edge keeps it open (plus the close-timer grace).
            // No upward padding, so the buffer never covers the header row and
            // steals hover/clicks from the nav arrows beside the button.
            <div
              style={{ top: pos.top, left: pos.left - 20 }}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
              className="fixed z-[140] px-5 pb-5"
            >
              <div
                role="menu"
                // Wide multi-column mega menu, everything visible at once. CSS
                // columns balance the groups automatically.
                className="slim-scroll max-h-[calc(100dvh-5rem)] w-[min(38rem,94vw)] gap-x-6 overflow-y-auto rounded-card border border-edge bg-surface p-4 shadow-(--shadow-card) columns-2 sm:columns-3"
              >
                {COMPILER_GROUPS.map((g) => (
                  <div key={g.label} className="mb-5 break-inside-avoid">
                    <p className="eyebrow mb-1.5 px-2">{g.label}</p>
                    <div className="flex flex-col">
                      {g.slugs.map((slug) => {
                        const isActive = slug === active;
                        return (
                          <Link
                            key={slug}
                            href={`/${slug}`}
                            role="menuitem"
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => setOpen(false)}
                            className={`flex items-center gap-2.5 rounded-btn px-2 py-1.5 text-sm normal-case tracking-normal transition-colors ${
                              isActive
                                ? "bg-raised font-medium text-ink dark:text-gold"
                                : "text-ink-muted hover:bg-raised hover:text-ink dark:hover:text-gold"
                            }`}
                          >
                            <LangIcon slug={slug} className="size-4 shrink-0" />
                            {getCompilerLang(slug)?.label ?? slug}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
