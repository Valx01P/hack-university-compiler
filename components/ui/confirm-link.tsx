"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

/**
 * A link that asks with a second click instead of a popup, like the answer
 * eye (components/code/answer-toggle.tsx): the first click makes it glow
 * (globals.css .answer-armed), and a second click within 3 seconds follows
 * it. Tabbing or clicking away, or waiting, lets it go. A new tab click
 * (Cmd, Ctrl, Shift, or the middle button) opens straight away, since it
 * doesn't leave the page. It's a real link, so hovering prefetches the page.
 */
export function ConfirmLink({
  href,
  tooltip,
  armedLabel,
  className = "",
  children,
}: {
  href: string;
  /** What it does, shown as its tooltip. */
  tooltip: string;
  /** Its tooltip and label while it waits for the second click. */
  armedLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  function click(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // the second click goes through
    if (armed) return;
    e.preventDefault();
    setArmed(true);
  }

  return (
    <Link
      href={href}
      onClick={click}
      onBlur={() => setArmed(false)}
      title={armed ? armedLabel : tooltip}
      aria-label={armed ? armedLabel : undefined}
      className={`${className} ${armed ? "answer-armed" : ""}`}
    >
      {children}
    </Link>
  );
}
