"use client";

import { useEffect } from "react";

/** Toggles `html[data-scrolled]` once the page is scrolled past the top, so the
    sticky header can switch from transparent to a solid background + hairline
    (styled in globals.css `.site-header`). Renders nothing. */
export function HeaderScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => {
      if (window.scrollY > 8) root.setAttribute("data-scrolled", "");
      else root.removeAttribute("data-scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute("data-scrolled");
    };
  }, []);
  return null;
}
