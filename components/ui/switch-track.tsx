/** The on and off track of a switch. The row around it is the control (a
    button with role "switch" or "menuitemcheckbox"), so this is decoration. */
export function SwitchTrack({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-[18px] w-8 shrink-0 rounded-full border transition-colors ${
        on ? "border-ink bg-ink" : "border-edge-strong"
      } ${className}`}
    >
      <span
        className={`absolute left-[2px] top-[2px] size-3 rounded-full transition-transform ${
          on ? "translate-x-[14px] bg-canvas" : "bg-ink-faint"
        }`}
      />
    </span>
  );
}
