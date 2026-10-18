"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Settings } from "lucide-react";

export type CodeEditorSettings = {
  tabSize: 2 | 4;
  fontSize: number;
  intellisense: boolean;
};

const EVENT_NAME = "hu:code-editor-settings";
const DEFAULT_SETTINGS: CodeEditorSettings = {
  tabSize: 4,
  fontSize: 13,
  intellisense: true,
};

function normalize(raw: Partial<CodeEditorSettings> | null | undefined): CodeEditorSettings {
  const tabSize = raw?.tabSize === 2 ? 2 : 4;
  const fontSize = Math.min(22, Math.max(11, Number(raw?.fontSize ?? DEFAULT_SETTINGS.fontSize)));
  return {
    tabSize,
    fontSize,
    intellisense: raw?.intellisense !== false,
  };
}

// Like the editor layout, these are never saved: a reload always opens the
// editor at the defaults instead of jumping to a restored font size. They
// live for this page load, so they carry over as you switch languages.
let sessionSettings: CodeEditorSettings = DEFAULT_SETTINGS;

function setCodeEditorSettings(next: CodeEditorSettings) {
  sessionSettings = normalize(next);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: sessionSettings }));
}

export function useCodeEditorSettings() {
  const [settings, setSettings] = useState<CodeEditorSettings>(() => sessionSettings);

  useEffect(() => {
    setSettings(sessionSettings);
    const onSettings = (event: Event) => {
      const custom = event as CustomEvent<CodeEditorSettings>;
      setSettings(normalize(custom.detail));
    };
    window.addEventListener(EVENT_NAME, onSettings);
    return () => window.removeEventListener(EVENT_NAME, onSettings);
  }, []);

  return settings;
}

export function EditorSettingsButton({
  className = "",
  buttonClassName,
  tools,
}: {
  className?: string;
  buttonClassName?: string;
  /** Optional extra controls rendered at the top of the popover (the
      compiler tucks its code theme picker here). */
  tools?: ReactNode;
}) {
  const settings = useCodeEditorSettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<CodeEditorSettings>) => {
    setCodeEditorSettings(normalize({ ...settings, ...patch }));
  };

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 256;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(rect.right - width, window.innerWidth - width - margin)
    );
    setPos({ top: rect.bottom + 8, left });
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      // Keep open when interacting with a nested portaled popover opened from
      // the `tools` row — it lives in a body portal, so it's outside panelRef.
      if (target instanceof Element && target.closest("[data-editor-overlay]")) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const sync = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open]);

  const panel =
    open && mounted && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[120] w-64 rounded-card border border-edge bg-surface p-3 text-sm shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">Editor settings</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-btn px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                Done
              </button>
            </div>

            {tools && (
              <div className="mt-3 flex flex-wrap items-center gap-0.5 border-b border-edge pb-3 text-ink-muted">
                {tools}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-ink-muted">Tab size</span>
                <div className="flex rounded-btn border border-edge-strong p-0.5">
                  {[2, 4].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => update({ tabSize: size as 2 | 4 })}
                      aria-pressed={settings.tabSize === size}
                      className={`rounded-[5px] px-3 py-1 text-xs font-medium transition-colors ${
                        settings.tabSize === size
                          ? "bg-ink text-canvas"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-4">
                <span className="text-ink-muted">Intellisense</span>
                <input
                  type="checkbox"
                  checked={settings.intellisense}
                  onChange={(e) => update({ intellisense: e.target.checked })}
                  className="size-4 accent-ink"
                />
              </label>

              <div className="flex items-center justify-between gap-4">
                <span className="text-ink-muted">Zoom</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => update({ fontSize: settings.fontSize - 1 })}
                    className="inline-flex size-8 items-center justify-center rounded-btn border border-edge-strong text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    aria-label="Zoom out code editor"
                    title="Zoom out"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-10 text-center font-mono text-xs text-ink-muted">
                    {settings.fontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ fontSize: settings.fontSize + 1 })}
                    className="inline-flex size-8 items-center justify-center rounded-btn border border-edge-strong text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    aria-label="Zoom in code editor"
                    title="Zoom in"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Code editor settings"
        title="Code editor settings"
        className={
          buttonClassName ??
          "inline-flex size-8 items-center justify-center rounded-btn text-code-gutter transition-colors hover:bg-code-edge hover:text-code-ink"
        }
      >
        <Settings className="size-4" />
      </button>
      {panel}
    </div>
  );
}
