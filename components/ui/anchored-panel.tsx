"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* A dropdown/popover panel portaled to <body> and pinned (position:fixed) under
   its trigger. Portaling lets a toolbar scroll horizontally (overflow-x) without
   clipping these — an in-flow `absolute` panel would be cut off by the scroller.
   Mirrors EditorSettingsButton's approach. Used by the compiler toolbar's
   reset confirm. */
export function AnchoredPanel({
  anchorRef,
  open,
  onClose,
  align = "left",
  className = "",
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 8;
      const width = panelRef.current?.offsetWidth ?? 0;
      let left = align === "right" ? r.right - width : r.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      setPos({ top: r.bottom + 6, left });
    };
    place();
    const raf = requestAnimationFrame(place); // re-place once the panel has width
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, onClose, align, anchorRef]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      ref={panelRef}
      data-editor-overlay
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className={className}
    >
      {children}
    </div>,
    document.body
  );
}
