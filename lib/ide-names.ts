/**
 * Small helpers the explorer and the editor share: a mode as ls prints it, a
 * size in words, and what's wrong with a new file or folder name.
 */

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
