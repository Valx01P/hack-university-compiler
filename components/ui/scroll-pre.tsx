"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A <pre> that can scroll. While its content overflows it joins the tab order
 * as a labelled region, so the hidden part can be scrolled from the keyboard
 * in every browser (Safari never makes scrollers focusable on its own). When
 * it fits, it stays a plain <pre> and adds no tab stop.
 */
export function ScrollPre({
  label,
  className,
  text,
  children,
}: {
  label: string;
  className: string;
  /** The text shown, when `children` is markup (highlighted code): the pre is
      measured again whenever it changes. */
  text?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [overflows, setOverflows] = useState(false);
  const content = text ?? children;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    // Only text past the edge counts: the end padding alone (room for the
    // copy button) can make the box scroll without hiding anything.
    const measure = () => {
      if (!live) return;
      const cs = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const wide = (parseFloat(cs.paddingLeft) || 0) + range.getBoundingClientRect().width > el.clientWidth + 1;
      const tall = el.scrollHeight - (parseFloat(cs.paddingBottom) || 0) > el.clientHeight + 1;
      setOverflows(wide || tall);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // A web font arriving can widen the text without resizing the box.
    document.fonts?.ready.then(measure);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [content]);
  return (
    <pre
      ref={ref}
      tabIndex={overflows ? 0 : undefined}
      role={overflows ? "region" : undefined}
      aria-label={overflows ? label : undefined}
      className={className}
    >
      {children}
    </pre>
  );
}
