"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dragAndDropFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type FeatureImplementation,
  type ItemInstance,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import { ChevronDown, ChevronRight, ChevronsDownUp, FilePlus, FolderPlus, MoreHorizontal } from "lucide-react";
import { FileIcon } from "@/components/ide/file-icon";
import { useStore, type FileNode, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The file explorer (architecture §8.3): the workspace's real files, as the
 * terminal and servers see them, with Material icons. Built on headless-tree
 * (ARIA tree roles, the APG keys, F2 to rename, drag and drop with a
 * keyboard drag on Control+Shift+D) and drawn with the app's own rows.
 *
 * - New file and New folder add an inline row in the focused folder, where
 *   `a/b/c.ts` makes the folders on the way.
 * - Right-click, Shift+F10, the Menu key, or a row's "more" button opens the
 *   row's menu: rename, duplicate, delete (with a confirm), reset to the
 *   original, copy the path, and reveal in the terminal.
 * - Marks: the unsaved dot, M (changed from the starting point), U (new), !
 *   (changed on disk while you had unsaved edits), an executable mark, a
 *   symlink arrow, and "Removed from the original" with Restore. Folders
 *   roll up their children's marks.
 * - Names are case-sensitive, as on Linux (User.ts and user.ts are two
 *   files), and the hover title says so with each file's size, time, and mode.
 * - New rows appear without animation, and the list never jumps when the
 *   terminal changes files.
 */

const NEW_ID = "\u0000new";

// The tree moves DOM focus to its focused row after a rename or a drop, and
// to the first row when that one is gone. Only while focus is in the tree:
// it must never pull focus out of the editor or a terminal you're typing in.
const keepFocusFeature: FeatureImplementation = {
  key: "keep-focus",
  deps: ["tree"],
  treeInstance: {
    updateDomFocus: ({ tree, prev }) => {
      const el = tree.getElement();
      if (el && el.contains(document.activeElement)) prev?.();
    },
  },
};
const ROW = "group relative flex h-[22px] cursor-pointer select-none items-center gap-1 pr-2 text-[13px] leading-[22px] outline-none";

type Creating = { parent: string; kind: "file" | "dir" } | null;
type Menu = { path: string; x: number; y: number; confirmDelete?: boolean } | null;

/** "rwxr-xr-x" from a mode. */
export function modeString(mode?: number): string {
  if (mode === undefined) return "";
  const bits = mode & 0o777;
  return [6, 3, 0].map((s) => `${bits & (4 << s) ? "r" : "-"}${bits & (2 << s) ? "w" : "-"}${bits & (1 << s) ? "x" : "-"}`).join("");
}

export function formatBytes(size?: number): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Checks a new name: one or more path segments, nothing Linux or the
    runner refuses. Returns the problem, or null. */
export function nameProblem(name: string, taken: (path: string) => boolean, parent: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give it a name.";
  if (trimmed.includes("\\")) return "Use / between folders, not \\.";
  if (trimmed.startsWith("/")) return "Names start inside the workspace, without a leading /.";
  const parts = trimmed.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return "A name can't be empty, . or ..";
  if (parts.some((p) => new TextEncoder().encode(p).length > 255)) return "Each name must be under 256 bytes.";
  if (trimmed.includes("\0")) return "Names can't hold a NUL character.";
  const full = parent ? `${parent}/${trimmed}` : trimmed;
  if (taken(full)) return `${trimmed} already exists here.`;
  return null;
}

export function Explorer({
  store,
  onRevealInTerminal,
  hiddenFiles = false,
}: {
  store: WorkspaceStore;
  /** cd into a folder in the terminal. */
  onRevealInTerminal?: (dir: string) => void;
  /** Show .git and the template's other hidden paths. */
  hiddenFiles?: boolean;
}) {
  const treeVersion = useStore(store, "tree");
  useStore(store, "files");
  const [creating, setCreating] = useState<Creating>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [removedOpen, setRemovedOpen] = useState(false);
  const hidden = useMemo(() => new Set(hiddenFiles ? [] : [".git", ...store.props.template.hidden]), [hiddenFiles, store]);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleKids = (path: string) => {
    const kids = store.children(path).filter((p) => !hidden.has(p));
    return creating && creating.parent === path ? [`${path ? `${path}/` : ""}${NEW_ID}`, ...kids] : kids;
  };

  // One array per change, or the tree takes each render's copy for a new
  // expansion and rebuilds without end.
  const expandedItems = useMemo(() => [...store.expanded], [store, treeVersion]);
  // The file open in the editor is the explorer's focus, without taking
  // keyboard focus from the editor.
  const [focusedItem, setFocusedItem] = useState<string | null>(store.active);
  const [selectedItems, setSelectedItems] = useState<string[]>(store.active ? [store.active] : []);
  useEffect(() => {
    if (!store.active) return;
    setFocusedItem(store.active);
    setSelectedItems([store.active]);
  }, [store.active]);

  const tree = useTree<FileNode>({
    rootItemId: "",
    getItemName: (item) => item.getItemData()?.name ?? "",
    isItemFolder: (item) => {
      const id = item.getId();
      if (id.endsWith(NEW_ID)) return false;
      return store.isDir(id);
    },
    dataLoader: {
      getItem: (id) =>
        id === ""
          ? { path: "", name: "", type: "dir" }
          : (store.nodes.get(id) ?? { path: id, name: id.slice(id.lastIndexOf("/") + 1), type: creating?.kind === "dir" ? "dir" : "file" }),
      getChildren: (id) => visibleKids(id),
    },
    state: { expandedItems, focusedItem, selectedItems },
    setFocusedItem,
    setSelectedItems,
    setExpandedItems: (updater) => {
      const next = typeof updater === "function" ? updater([...store.expanded]) : updater;
      for (const path of next) if (!store.expanded.has(path) && store.nodes.get(path)?.lazy) void store.loadFolder(path);
      store.setExpanded(next);
    },
    indent: 12,
    onPrimaryAction: (item) => {
      const id = item.getId();
      if (!item.isFolder() && !id.endsWith(NEW_ID)) store.openFile(id);
    },
    canRename: (item) => !item.getId().endsWith(NEW_ID),
    onRename: (item, value) => {
      const from = item.getId();
      const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
      if (value === item.getItemName()) return;
      const problem = nameProblem(value, (p) => store.nodes.has(p) && p !== from, parent);
      if (problem) return store.announce(problem);
      const to = parent ? `${parent}/${value.trim()}` : value.trim();
      // The renamed row keeps the focus.
      setFocusedItem(to);
      setSelectedItems([to]);
      void store.rename(from, to);
    },
    canReorder: false,
    canDrag: (items) => items.every((i) => !i.getId().endsWith(NEW_ID)),
    canDrop: (items, target) => {
      const into = target.item.getId();
      if (into !== "" && !store.isDir(into)) return false;
      return items.every((i) => {
        const id = i.getId();
        const parent = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
        return parent !== into && into !== id && !into.startsWith(`${id}/`);
      });
    },
    onDrop: async (items, target) => {
      const into = target.item.getId();
      for (const item of items) {
        const id = item.getId();
        const name = id.slice(id.lastIndexOf("/") + 1);
        const to = into ? `${into}/${name}` : name;
        if (store.nodes.has(to)) {
          store.announce(`${to} already exists.`);
          continue;
        }
        await store.rename(id, to);
      }
    },
    hotkeys: {
      customDelete: {
        hotkey: "Delete",
        handler: (_e, t) => {
          const item = t.getFocusedItem();
          if (item && item.getId()) openMenuFor(item.getId(), true);
        },
      },
      customDeleteMac: {
        hotkey: "Meta+Backspace",
        handler: (_e, t) => {
          const item = t.getFocusedItem();
          if (item && item.getId()) openMenuFor(item.getId(), true);
        },
      },
      customMenu: {
        hotkey: "Shift+F10",
        handler: (_e, t) => {
          const item = t.getFocusedItem();
          if (item && item.getId()) openMenuFor(item.getId());
        },
      },
      customMenuKey: {
        hotkey: "ContextMenu",
        handler: (_e, t) => {
          const item = t.getFocusedItem();
          if (item && item.getId()) openMenuFor(item.getId());
        },
      },
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, renamingFeature, dragAndDropFeature, keyboardDragAndDropFeature, expandAllFeature, keepFocusFeature],
  });

  // The list follows the store (the terminal made a file, a save, a reset).
  const built = useRef(-1);
  if (built.current !== treeVersion + (creating ? 1e9 : 0)) {
    built.current = treeVersion + (creating ? 1e9 : 0);
    tree.scheduleRebuildTree();
  }

  function openMenuFor(path: string, confirmDelete = false) {
    const el = tree.getItemInstance(path)?.getElement();
    const r = el?.getBoundingClientRect();
    setMenu({ path, x: r ? r.left + 24 : 80, y: r ? r.bottom : 80, confirmDelete });
  }

  /** Where New file and New folder go: the focused folder, or the focused
      file's folder. */
  function targetFolder(): string {
    const focused = tree.getState().focusedItem;
    if (!focused || focused.endsWith(NEW_ID)) return "";
    if (store.isDir(focused)) return focused;
    return focused.includes("/") ? focused.slice(0, focused.lastIndexOf("/")) : "";
  }

  function startCreating(kind: "file" | "dir", parent = targetFolder()) {
    if (parent && !store.expanded.has(parent)) store.setExpanded([...store.expanded, parent]);
    setCreating({ parent, kind });
    setMenu(null);
  }

  useEffect(() => {
    const onNew = (e: Event) => startCreating((e as CustomEvent<"file" | "dir">).detail ?? "file");
    window.addEventListener(`hu:ide-new:${store.id}`, onNew);
    return () => window.removeEventListener(`hu:ide-new:${store.id}`, onNew);
  });

  const items = tree.getItems();
  const dirtyPaths = new Set([...store.buffers.values()].filter((b) => b.dirty).map((b) => b.path));
  const conflicts = new Set([...store.buffers.values()].filter((b) => b.conflict).map((b) => b.path));
  const dirtyDirs = new Set<string>();
  for (const p of dirtyPaths) {
    let dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    while (dir) {
      dirtyDirs.add(dir);
      dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    }
  }
  const iconBtn = "inline-flex size-6 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line pl-3 pr-1.5">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-ink-faint dark:text-gold">Explorer</h2>
        <button type="button" onClick={() => startCreating("file")} className={iconBtn} title="New file (Alt+N)" aria-label="New file">
          <FilePlus className="size-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => startCreating("dir")} className={iconBtn} title="New folder" aria-label="New folder">
          <FolderPlus className="size-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => store.setExpanded([])} className={iconBtn} title="Collapse folders" aria-label="Collapse folders">
          <ChevronsDownUp className="size-3.5" aria-hidden />
        </button>
      </div>
      {store.undoDelete && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1 text-xs text-ink-muted" role="status">
          <span className="min-w-0 flex-1 truncate">Deleted {store.undoDelete.path}</span>
          <button type="button" onClick={() => void store.undoLastDelete()} className="shrink-0 rounded-btn px-1.5 font-medium text-ink hover:bg-raised">
            Undo
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        {...tree.getContainerProps("Files")}
        onContextMenu={(e) => {
          const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
          if (!row) return;
          e.preventDefault();
          setMenu({ path: row.dataset.path!, x: e.clientX, y: e.clientY });
        }}
        className="slim-scroll min-h-0 flex-1 overflow-auto py-1 outline-none"
      >
        {items.map((item) => (
          <Row
            key={item.getKey()}
            item={item}
            store={store}
            creating={creating}
            onCreated={() => setCreating(null)}
            onMenu={(path, x, y) => setMenu({ path, x, y })}
            dirty={dirtyPaths.has(item.getId()) || dirtyDirs.has(item.getId())}
            conflict={conflicts.has(item.getId())}
          />
        ))}
        <div style={tree.getDragLineStyle()} className="pointer-events-none h-0.5 bg-accent-strong" />
        {store.removed.length > 0 && (
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => setRemovedOpen((v) => !v)}
              aria-expanded={removedOpen}
              className={`${ROW} w-full pl-2 text-left text-xs text-ink-faint hover:text-ink`}
            >
              {removedOpen ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
              Removed from the original ({store.removed.length})
            </button>
            {removedOpen &&
              store.removed.map((path) => (
                <div key={path} className={`${ROW} pl-6 text-ink-faint`}>
                  <FileIcon name={path.slice(path.lastIndexOf("/") + 1)} className="opacity-60" />
                  <span className="min-w-0 flex-1 truncate line-through decoration-ink-faint/60" title={path}>
                    {path}
                  </span>
                  <button type="button" onClick={() => void store.restore(path)} className="shrink-0 rounded-btn px-1.5 text-xs text-ink-muted hover:bg-raised hover:text-ink">
                    Restore
                  </button>
                </div>
              ))}
          </div>
        )}
        <AssistiveTreeDescription tree={tree} />
      </div>
      {menu && (
        <RowMenu
          store={store}
          menu={menu}
          onClose={() => {
            setMenu(null);
            containerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
          }}
          onRename={(path) => {
            setMenu(null);
            tree.getItemInstance(path)?.startRenaming();
          }}
          onNew={(kind, parent) => startCreating(kind, parent)}
          onReveal={onRevealInTerminal}
        />
      )}
    </div>
  );
}

function Row({
  item,
  store,
  creating,
  onCreated,
  onMenu,
  dirty,
  conflict,
}: {
  item: ItemInstance<FileNode>;
  store: WorkspaceStore;
  creating: Creating;
  onCreated: () => void;
  onMenu: (path: string, x: number, y: number) => void;
  dirty: boolean;
  conflict: boolean;
}) {
  const id = item.getId();
  const level = item.getItemMeta().level;
  const pad = 8 + level * 12;
  if (id.endsWith(NEW_ID) && creating) return <NewRow store={store} creating={creating} pad={pad} onDone={onCreated} />;
  const node = item.getItemData();
  const folder = item.isFolder();
  const open = folder && item.isExpanded();
  const state = folder ? store.rollup.get(id) : node?.state === "same" ? undefined : node?.state;
  const active = store.active === id;
  const exec = !folder && node?.mode !== undefined && (node.mode & 0o111) !== 0;
  const mark = conflict ? "!" : state === "new" ? "U" : state === "modified" ? "M" : null;
  const title = [
    id,
    folder ? "folder" : formatBytes(node?.size),
    node?.mtimeMs ? `modified ${new Date(node.mtimeMs).toLocaleString()}` : "",
    modeString(node?.mode),
    node?.type === "symlink" ? `link to ${node.target}${node.outside ? " (outside the workspace)" : ""}` : "",
    "Names are case-sensitive, as on Linux.",
  ]
    .filter(Boolean)
    .join(" · ");
  const props = item.getProps();
  return (
    <div
      {...props}
      data-path={id}
      title={title}
      style={{ paddingLeft: pad }}
      className={`${ROW} ${
        active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/70 hover:text-ink"
      } ${item.isFocused() ? "focus-visible:outline-2 focus-visible:-outline-offset-2" : ""} ${
        item.isDragTarget() ? "bg-accent/40" : ""
      } ${node?.lazy ? "opacity-60" : ""}`}
    >
      <span className="inline-flex w-3.5 shrink-0 justify-center text-ink-faint">
        {folder ? open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden /> : null}
      </span>
      <FileIcon name={node?.name ?? ""} folder={folder} open={open} />
      {item.isRenaming() ? (
        <input
          {...item.getRenameInputProps()}
          spellCheck={false}
          autoComplete="off"
          className="h-[20px] min-w-0 flex-1 rounded-[3px] border border-ink bg-canvas px-1 font-sans text-base text-ink outline-none sm:text-[13px]"
        />
      ) : (
        <span className={`min-w-0 flex-1 truncate ${state ? "text-ink" : ""}`}>
          {node?.name}
          {node?.type === "symlink" && <span className="ml-1 text-ink-faint" aria-label="symlink">↪</span>}
          {exec && <span className="ml-1 font-mono text-[10px] text-ink-faint" title="Executable">x</span>}
        </span>
      )}
      {dirty && <span aria-label="unsaved" title="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-ink" />}
      {mark && (
        <span
          title={mark === "!" ? "Changed on disk while you had unsaved edits" : mark === "U" ? "New: not in the original" : "Changed from the original"}
          className={`w-3 shrink-0 text-center font-mono text-[11px] font-semibold ${mark === "!" ? "text-ink" : "text-ink-faint"}`}
        >
          {mark}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`More for ${node?.name}`}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(id, r.left, r.bottom);
        }}
        className="hidden size-5 shrink-0 items-center justify-center rounded-btn text-ink-faint hover:bg-surface hover:text-ink group-hover:inline-flex group-focus-visible:inline-flex pointer-coarse:inline-flex"
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** The inline row New file and New folder add, focused, with its errors. */
function NewRow({ store, creating, pad, onDone }: { store: WorkspaceStore; creating: NonNullable<Creating>; pad: number; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const submit = async () => {
    const problem = nameProblem(value, (p) => store.nodes.has(p), creating.parent);
    if (problem) return setError(problem);
    const path = creating.parent ? `${creating.parent}/${value.trim()}` : value.trim();
    const ok = creating.kind === "dir" ? await store.createFolder(path) : await store.createFile(path);
    if (ok) onDone();
  };
  return (
    <div className="relative py-px pr-2" style={{ paddingLeft: pad + 18 }}>
      <div className="flex items-center gap-1">
        <FileIcon name={value || (creating.kind === "dir" ? "folder" : "new")} folder={creating.kind === "dir"} />
        <input
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!value.trim()) onDone();
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label={creating.kind === "dir" ? "New folder name" : "New file name (a/b/c.ts makes the folders)"}
          aria-invalid={error !== null}
          placeholder={creating.kind === "dir" ? "folder name" : "file name, or a/b/c.ts"}
          className="h-[20px] min-w-0 flex-1 rounded-[3px] border border-ink bg-canvas px-1 font-sans text-base text-ink outline-none placeholder:text-ink-faint sm:text-[13px]"
        />
      </div>
      {error && (
        <p role="alert" className="mt-0.5 rounded-btn border border-line-strong bg-surface px-1.5 py-0.5 text-xs text-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** A row's menu, portaled under the pointer or the row (role="menu"). */
function RowMenu({
  store,
  menu,
  onClose,
  onRename,
  onNew,
  onReveal,
}: {
  store: WorkspaceStore;
  menu: NonNullable<Menu>;
  onClose: () => void;
  onRename: (path: string) => void;
  onNew: (kind: "file" | "dir", parent: string) => void;
  onReveal?: (dir: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(Boolean(menu.confirmDelete));
  const node = store.nodes.get(menu.path);
  const folder = store.isDir(menu.path);
  const dir = folder ? menu.path : menu.path.includes("/") ? menu.path.slice(0, menu.path.lastIndexOf("/")) : "";
  const changed = folder ? store.rollup.has(menu.path) : node?.state === "modified";
  const inOriginal = store.props.tree.entries.some((e) => e.path === menu.path);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose, confirm]);

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const items: { label: string; run: () => void; hint?: string }[] = [
    { label: "New file…", run: () => onNew("file", dir) },
    { label: "New folder…", run: () => onNew("dir", dir) },
    { label: "Rename…", hint: "F2", run: () => onRename(menu.path) },
    ...(!folder ? [{ label: "Duplicate", run: act(() => void store.duplicate(menu.path)) }] : []),
    { label: "Copy path", run: act(() => void navigator.clipboard?.writeText(`/workspace/${menu.path}`)) },
    { label: "Copy relative path", run: act(() => void navigator.clipboard?.writeText(menu.path)) },
    ...(onReveal ? [{ label: "Reveal in terminal", run: act(() => onReveal(dir)) }] : []),
    ...(changed && inOriginal
      ? [{ label: folder ? "Reset folder to the original" : "Reset to the original", run: act(() => void store.reset(folder ? "dir" : "file", menu.path)) }]
      : []),
    { label: "Delete…", hint: "Del", run: () => setConfirm(true) },
  ];

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem], button") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(at + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
    } else if (e.key === "Tab") onClose();
  };

  const x = Math.min(menu.x, window.innerWidth - 240);
  const y = Math.min(menu.y, window.innerHeight - (confirm ? 120 : 300));
  return createPortal(
    <div
      ref={ref}
      data-popup
      role={confirm ? "dialog" : "menu"}
      aria-label={confirm ? `Delete ${menu.path}` : `Actions for ${menu.path}`}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", left: x, top: y }}
      className="z-[150] w-56 rounded-card border border-edge bg-surface p-1 text-sm shadow-[var(--shadow-card)]"
    >
      {confirm ? (
        <div className="p-2">
          <p className="font-medium text-ink">Delete {node?.name ?? menu.path}?</p>
          <p className="mt-1 text-xs text-ink-muted">
            {folder ? "The folder and everything in it go" : "It goes"} to the workspace&apos;s trash. {inOriginal ? "Reset brings the original back." : ""}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-btn px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-raised hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={act(() => void store.remove(menu.path))}
              className="rounded-btn border border-edge-strong px-3 py-1.5 text-xs font-medium btn-grad"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={it.run}
            className="flex w-full items-center justify-between gap-3 rounded-btn px-2.5 py-1.5 text-left text-[13px] text-ink-muted outline-none hover:bg-raised hover:text-ink focus-visible:bg-raised focus-visible:text-ink"
          >
            {it.label}
            {it.hint && <span className="font-mono text-[11px] text-ink-faint">{it.hint}</span>}
          </button>
        ))
      )}
    </div>,
    document.body
  );
}

