"use client";

/**
 * A vertical border you drag sideways to resize the panes on either side,
 * drawn like the compiler's editor and output divider. Arrow keys nudge it
 * (Shift for bigger steps), Home and End go to the limits, and a double-click
 * puts it back. Pass the display classes (`hidden lg:flex`) in `className`.
 */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  step,
  bigStep,
  onChange,
  onDrag,
  onReset,
  quiet = false,
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  bigStep: number;
  onChange: (next: number) => void;
  /** The pointer's x while dragging. */
  onDrag: (clientX: number) => void;
  onReset: () => void;
  /** No line until hovered or focused, for a border at the panel's edge. */
  quiet?: boolean;
  className?: string;
}) {
  // Pointer capture keeps move events coming over the code editor, and no text
  // selection while dragging stops it from highlighting the lesson.
  function start(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => onDrag(ev.clientX);
    const up = () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      handle.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const by = e.shiftKey ? bigStep : step;
    const next =
      e.key === "ArrowLeft" ? value - by
      : e.key === "ArrowRight" ? value + by
      : e.key === "Home" ? min
      : e.key === "End" ? max
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Drag to resize. Double-click to reset."
      className={`group w-[9px] shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center outline-none ${className}`}
    >
      <div
        className={`pointer-events-none w-px transition-colors group-hover:w-[2px] group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong ${
          quiet ? "bg-transparent" : "bg-edge"
        }`}
      />
    </div>
  );
}
