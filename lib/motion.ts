"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollToPlugin);

/**
 * Motion for the whole app, on GSAP. Every animation answers something you
 * did (opening a menu, folding a list, checking code, moving to the next
 * part), never the first paint, so a reload never moves anything. With the
 * system's "reduce motion" setting on, every duration is 0 and things simply
 * appear.
 */
export { gsap, useGSAP };

export const EASE = {
  out: "power2.out",
  in: "power2.in",
  inOut: "power2.inOut",
  /** Drawers and panels sliding in: quick start, soft landing. */
  slide: "power3.out",
  /** A small overshoot for things that pop, like the solved check. */
  pop: "back.out(2.2)",
} as const;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A duration in seconds, or 0 when the user prefers reduced motion. */
export const dur = (seconds: number) => (prefersReducedMotion() ? 0 : seconds);

// True once the page has painted. Animations that run on mount (a new part
// fading in, results sliding up) skip the first paint, so a reload shows the
// page at rest. Strict Mode's double mount happens before the frame, so it
// skips too.
let painted = false;
if (typeof window !== "undefined") requestAnimationFrame(() => (painted = true));
export const hasPainted = () => painted;

/**
 * Keeps an element rendered while it animates out. Opening renders it and
 * plays `enter`, closing plays `exit` and then drops it. Returns whether to
 * render it. Only changes of `open` animate, so an element that starts open
 * appears without moving.
 */
export function usePresence(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  { enter, exit }: { enter: gsap.TweenVars; exit: gsap.TweenVars }
) {
  const [rendered, setRendered] = useState(open);
  // Opening renders it right away (state set during render, so the element is
  // there by the time the layout effect animates it).
  if (open && !rendered) setRendered(true);
  const was = useRef(open);

  useLayoutEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const el = ref.current;
    if (!el) return;
    if (open) {
      gsap.fromTo(el, styleOf(exit), {
        ...enter,
        duration: dur(Number(enter.duration ?? 0.16)),
        overwrite: true,
        clearProps: "opacity,transform,pointerEvents",
      });
    } else {
      gsap.to(el, {
        ...exit,
        duration: dur(Number(exit.duration ?? 0.12)),
        pointerEvents: "none",
        overwrite: true,
        onComplete: () => setRendered(false),
      });
    }
  }, [open, ref, enter, exit]);

  return open || rendered;
}

/** Just the styles in a set of tween vars, for a fromTo's start. */
function styleOf(vars: gsap.TweenVars): gsap.TweenVars {
  const { duration: _d, ease: _e, delay: _l, clearProps: _c, onComplete: _o, ...style } = vars;
  return style;
}

/** Popovers and menus: a short fade and lift in, a quicker fade out. */
export const POP = {
  enter: { opacity: 1, y: 0, scale: 1, duration: 0.16, ease: EASE.out },
  exit: { opacity: 0, y: -4, scale: 0.98, duration: 0.12, ease: EASE.in },
} satisfies { enter: gsap.TweenVars; exit: gsap.TweenVars };

const subscribeNothing = () => () => {};

/**
 * A short entrance (fade and rise) when the element mounts, for content that
 * replaces other content: the next lesson part, a challenge, the challenge
 * list. Skipped on the first paint, and whenever the element mounts by
 * hydrating the server's markup: a load or reload paints the page before
 * React hydrates it, often a few frames before, so `hasPainted` alone would
 * fade in what is already showing.
 */
export function useEnter(ref: RefObject<HTMLElement | null>, from: gsap.TweenVars = { opacity: 0, y: 8 }) {
  const hydrating = !useSyncExternalStore(subscribeNothing, () => true, () => false);
  useGSAP(
    () => {
      if (!ref.current || hydrating || !hasPainted()) return;
      gsap.from(ref.current, { ...from, duration: dur(0.24), ease: EASE.out, clearProps: "opacity,transform" });
    },
    { scope: ref }
  );
}
