"use client";

/**
 * A vertical border you drag sideways to resize the panes on either side,
 * drawn like the compiler's editor and output divider. Arrow keys nudge it
 * (Shift for bigger steps), Home and End go to the limits, and a double-click
 * puts it back. Pass the display classes (`hidden lg:flex`) in `className`.
 * With `orientation="horizontal"` it's a border you drag up and down (the
 * IDE's dock), with the up and down arrows.
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
  orientation = "vertical",
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  bigStep: number;
  onChange: (next: number) => void;
  /** The pointer's x while dragging (its y for a horizontal border). */
  onDrag: (clientX: number) => void;
  onReset: () => void;
  /** No line until hovered or focused, for a border at the panel's edge. */
  quiet?: boolean;
  /** "vertical" (the default) drags sideways, "horizontal" up and down. */
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  const across = orientation === "horizontal";
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
    document.body.style.cursor = across ? "row-resize" : "col-resize";
    const move = (ev: PointerEvent) => onDrag(across ? ev.clientY : ev.clientX);
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
      e.key === (across ? "ArrowUp" : "ArrowLeft") ? value - by
      : e.key === (across ? "ArrowDown" : "ArrowRight") ? value + by
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
      aria-orientation={across ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="Drag to resize. Double-click to reset."
      className={`group shrink-0 touch-none select-none outline-none ${
        across ? "h-[9px] cursor-row-resize flex-col items-stretch justify-center" : "w-[9px] cursor-col-resize items-stretch justify-center"
      } ${className}`}
    >
      <div
        className={`pointer-events-none transition-colors group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong ${
          across ? "h-px group-hover:h-[2px]" : "w-px group-hover:w-[2px]"
        } ${quiet ? "bg-transparent" : "bg-line"}`}
      />
    </div>
  );
}
