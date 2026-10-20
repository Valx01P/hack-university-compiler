// A menu button: a trigger that opens a list of actions, following the WAI-ARIA menu button
// pattern. Enter, Space, or the down arrow opens it on the first item (the up arrow on the last),
// the arrows and Home and End move between items, Escape closes it and returns focus to the
// trigger, and a click outside closes it. Items with a checked value are radio items.
import { clsx } from "clsx";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Menu.module.css";

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  checked?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  /** What the trigger shows. */
  trigger: ReactNode;
  /** The trigger's accessible name, when its content alone isn't clear ("Status: Doing"). */
  label?: string;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}

export function Menu({ trigger, label, items, align = "start", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const enabled = items.filter((item) => !item.disabled);
  const focusKey = initialFocus === "first" ? enabled[0]?.key : enabled.at(-1)?.key;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function openAt(position: "first" | "last") {
    setInitialFocus(position);
    setOpen(true);
  }

  function close({ returnFocus }: { returnFocus: boolean }) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      const next = (moves[event.key]! + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close({ returnFocus: true });
    } else if (event.key === "Tab") {
      close({ returnFocus: false });
    }
  }

  return (
    <div ref={rootRef} data-ui="menu" className={clsx(styles.root, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close({ returnFocus: false }) : openAt("first"))}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={clsx(styles.menu, align === "end" && styles.alignEnd)} onKeyDown={handleMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={item.checked}
              tabIndex={-1}
              disabled={item.disabled}
              // React focuses this element when it mounts, which is when the menu opens.
              autoFocus={item.key === focusKey}
              className={styles.item}
              onClick={() => {
                close({ returnFocus: true });
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
