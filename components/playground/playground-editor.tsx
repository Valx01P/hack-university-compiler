"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CodeThemePicker } from "@/components/code/code-theme";
import type { EditorSelection } from "@/components/code/cm-editor";
import { EditorSettingsButton } from "@/components/code/editor-settings";
import { ChangeReview } from "@/components/compiler/change-review";
import { EditorGroup, EditorTabs } from "@/components/ide/editor-group";
import { SwitchTrack } from "@/components/ui/switch-track";
import { FULL_SCREEN_TITLE, type ScreenMode } from "@/lib/full-screen";
import { setIdeSetting, useIdeSettings } from "@/lib/ide-settings";
import type { OutsideChange, OutsideChanges } from "@/lib/outside-changes";
import type { WorkspaceStore } from "@/lib/workspace-store";

/**
 * The playground's editor: its tabs, like VS Code's, with the Explorer's
 * fold at their start and full screen and the editor's settings at their
 * end (the code theme and the folder's own: Auto save, Option as Meta,
 * Terminal screen reader mode, Show hidden files), the bar for changes made
 * outside the editor (components/compiler/change-review.tsx) over the code,
 * and the code, one CodeMirror state per tab, each with its own review
 * (components/ide/editor-group.tsx). There's no reset and no Run: things
 * run in the terminal.
 */
export function PlaygroundEditor({
  store,
  changes,
  pending,
  explorerFolded,
  onToggleExplorer,
  screenMode,
  onStepFull,
  onSelection,
}: {
  store: WorkspaceStore;
  changes: OutsideChanges;
  pending: OutsideChange[];
  explorerFolded: boolean;
  onToggleExplorer: () => void;
  screenMode: ScreenMode;
  onStepFull: () => void;
  onSelection: (path: string, selection: EditorSelection) => void;
}) {
  const ideSettings = useIdeSettings();
  // No display of its own: each button says where it shows.
  const iconBtn = "size-7 shrink-0 items-center justify-center rounded-btn text-code-gutter transition-colors hover:text-code-ink";
  return (
    <>
      <EditorTabs
        store={store}
        pending={pending}
        leading={
          <button
            type="button"
            onClick={onToggleExplorer}
            aria-expanded={!explorerFolded}
            aria-label={explorerFolded ? "Show the Explorer" : "Fold the Explorer away"}
            title={explorerFolded ? "Show the Explorer (Mod+B)" : "Fold the Explorer away (Mod+B)"}
            className={`${iconBtn} mx-0.5 hidden self-center lg:inline-flex`}
          >
            {/* Each icon shows from the first paint, as the fold is
                (globals.css). */}
            <PanelLeftOpen className="playground-explorer-folded-only size-4" aria-hidden />
            <PanelLeftClose className="playground-explorer-open-only size-4" aria-hidden />
          </button>
        }
        trailing={
          <div className="flex shrink-0 items-center gap-0.5 px-1">
            <button
              type="button"
              onClick={onStepFull}
              title={FULL_SCREEN_TITLE[screenMode]}
              aria-label="Toggle full screen"
              aria-pressed={screenMode === "full" ? true : screenMode === "semi" ? "mixed" : false}
              className={`${iconBtn} hidden sm:inline-flex`}
            >
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
            <EditorSettingsButton
              buttonClassName={`${iconBtn} inline-flex`}
              className="shrink-0"
              tools={
                <div className="w-full space-y-2">
                  <CodeThemePicker className="field w-full rounded-btn px-2 py-1.5 text-xs font-medium text-ink" />
                  <SettingRow label="Auto save" hint="Saves 1 second after you stop typing" on={ideSettings.autosave} onToggle={() => setIdeSetting("autosave", !ideSettings.autosave)} />
                  <SettingRow label="Option as Meta" hint="Alt+B and Alt+F move by word in the terminal" on={ideSettings.optionIsMeta} onToggle={() => setIdeSetting("optionIsMeta", !ideSettings.optionIsMeta)} />
                  <SettingRow label="Terminal screen reader mode" on={ideSettings.screenReader} onToggle={() => setIdeSetting("screenReader", !ideSettings.screenReader)} />
                  <SettingRow label="Show hidden files" hint=".git and other hidden paths" on={ideSettings.hiddenFiles} onToggle={() => setIdeSetting("hiddenFiles", !ideSettings.hiddenFiles)} />
                  <p className="text-[11px] leading-4 text-ink-faint">
                    Save Mod+S · Quick open Mod+P · Terminal Ctrl+` · Explorer Mod+B · New file Alt+N · Close tab Alt+W
                  </p>
                </div>
              }
            />
          </div>
        }
      />
      <div className="code-dark flex min-h-0 flex-1 flex-col bg-code-bg">
        <ChangeReview
          pending={pending}
          open={store.active ?? ""}
          onShow={(path) => store.openFile(path)}
          onAccept={(path) => changes.accept(path)}
          onReject={(path) => void changes.reject(path)}
          onAcceptAll={() => changes.acceptAll()}
          onRejectAll={() => void changes.rejectAll()}
        />
        <EditorGroup
          store={store}
          pending={pending}
          onResolved={(path, text) => changes.resolved(path, text)}
          onSelection={onSelection}
          className="min-h-0 flex-1"
        />
      </div>
    </>
  );
}

function SettingRow({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-4 rounded-btn px-1 py-0.5 text-left transition-colors hover:bg-raised"
    >
      <span>
        <span className="block text-ink-muted">{label}</span>
        {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
