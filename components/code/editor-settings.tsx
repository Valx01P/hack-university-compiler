"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Settings } from "lucide-react";
import { CONTRAST_LEVELS, setContrast, useContrast } from "@/lib/theme";
import { SwitchTrack } from "@/components/ui/switch-track";
import { CodeBackgroundPicker, SelectionColorPicker } from "@/components/code/code-background";
import { POP, usePresence } from "@/lib/motion";

export type CodeEditorSettings = {
  tabSize: 2 | 4;
  fontSize: number;
  intellisense: boolean;
};

// Keep the key and the 11-22px zoom range in sync with the pre-paint
// bootstrap in app/layout.tsx, which applies the saved zoom before first paint.
const STORAGE_KEY = "hu-code-editor-settings-v1";
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

/** The editor reads its zoom from <html> (--code-user-fs) instead of React
    state, so the bootstrap can set it before first paint and a reload opens
    at your zoom with nothing shifting. */
function applyFontSize(px: number) {
  document.documentElement.style.setProperty("--code-user-fs", `${px}px`);
}

export function getCodeEditorSettings(): CodeEditorSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveCodeEditorSettings(next: CodeEditorSettings) {
  const settings = normalize(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applyFontSize(settings.fontSize);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: settings }));
}

export function useCodeEditorSettings() {
  // Read while initializing so the editor is created with your saved tab size
  // and completions from the start, never reconfigured after mount. No server
  // markup depends on these, so hydration is unaffected.
  const [settings, setSettings] = useState<CodeEditorSettings>(getCodeEditorSettings);

  useEffect(() => {
    const onSettings = (event: Event) => {
      const custom = event as CustomEvent<CodeEditorSettings>;
      setSettings(normalize(custom.detail));
    };
    // Another tab changed them: follow along, zoom included.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = getCodeEditorSettings();
      applyFontSize(next.fontSize);
      setSettings(next);
    };
    window.addEventListener(EVENT_NAME, onSettings);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onSettings);
      window.removeEventListener("storage", onStorage);
    };
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
  // The same contrast level the header theme menu sets (they stay in sync).
  const contrast = useContrast();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shown = usePresence(open, panelRef, POP);

  const update = (patch: Partial<CodeEditorSettings>) => {
    saveCodeEditorSettings(normalize({ ...settings, ...patch }));
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
    shown && mounted && pos
      ? createPortal(
          <div
            ref={panelRef}
            // Escape closes this before it leaves full screen (lib/full-screen.ts).
            data-popup
            style={{ position: "fixed", top: pos.top, left: pos.left, transformOrigin: "top right" }}
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
                <span className="text-ink-muted">Contrast</span>
                <div className="flex rounded-btn border border-edge-strong p-0.5">
                  {CONTRAST_LEVELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setContrast(c.id)}
                      aria-pressed={contrast === c.id}
                      className={`rounded-[5px] px-2 py-1 text-xs font-medium transition-colors ${
                        contrast === c.id
                          ? "bg-ink text-canvas"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-ink-muted">Background</span>
                <div className="mt-2">
                  <CodeBackgroundPicker compact />
                </div>
              </div>

              <div>
                <span className="text-ink-muted">Selection</span>
                <div className="mt-2">
                  <SelectionColorPicker compact />
                </div>
              </div>

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

              {/* A switch like the theme menu's: the whole row turns
                  suggestions as you type on and off. */}
              <button
                type="button"
                role="switch"
                aria-checked={settings.intellisense}
                onClick={() => update({ intellisense: !settings.intellisense })}
                className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-4 rounded-btn px-1 py-0.5 text-left transition-colors hover:bg-raised"
              >
                <span>
                  <span className="block text-ink-muted">Intellisense</span>
                  <span className="block text-xs text-ink-faint">Suggestions as you type</span>
                </span>
                <SwitchTrack on={settings.intellisense} />
              </button>

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
