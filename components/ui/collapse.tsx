"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EASE, dur, gsap } from "@/lib/motion";

/**
 * Folds its children open and closed by animating their height. Only changes
 * of `open` animate, so content that starts open shows at rest, and closed
 * content isn't rendered at all. Spacing belongs in `className` as padding,
 * which folds along with the content.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  const was = useRef(open);

  useLayoutEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const el = ref.current;
    if (!el) return;
    if (open) {
      // Reopening mid-fold grows from where it is, otherwise from nothing.
      const from = gsap.isTweening(el) ? {} : { height: 0, opacity: 0 };
      gsap.fromTo(
        el,
        { overflow: "hidden", ...from },
        { height: "auto", opacity: 1, duration: dur(0.24), ease: EASE.out, overwrite: true, clearProps: "height,opacity,overflow" }
      );
    } else {
      gsap.to(el, {
        height: 0,
        opacity: 0,
        overflow: "hidden",
        duration: dur(0.2),
        ease: EASE.in,
        overwrite: true,
        onComplete: () => setRendered(false),
      });
    }
  }, [open]);

  if (!open && !rendered) return null;
  return (
    <div ref={ref} id={id} className={className}>
      {children}
    </div>
  );
}
