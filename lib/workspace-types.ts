/**
 * The shapes a folder's page shares between the server and the browser: what
 * a page tells it about its workspace (lib/workspaces.ts builds it), and the
 * runner's tree entries (architecture §3.2, §3.3). Pure types and small
 * helpers, safe anywhere.
 */

/** What the page needs to know about a template. */
export interface WorkspaceTemplateInfo {
  /** <course>/<template>, or playground/blank. */
  id: string;
  title: string;
  /** What the folder is and what it's for. */
  description: string | null;
  /** Files opened at first, in order (README.md first). */
  open: string[];
  readonly: string[];
  hidden: string[];
  autosave: boolean;
}

/** One entry of a workspace's tree, as the runner lists it. */
export interface TreeEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "fifo" | "socket" | "mount" | "other";
  size?: number;
  mtimeMs?: number;
  mode?: number;
  target?: string;
  /** A symlink that points outside the workspace. */
  outside?: boolean;
  /** Against the starting point: unchanged, changed (M), or new (U). */
  state?: "same" | "modified" | "new";
}

/** The tree a page paints first: the starting point's files, from
    .generated/workspaces (scripts/build-content.mjs). */
export interface StartingTree {
  hash: string;
  entries: { path: string; type: "file" | "dir"; size?: number; mode?: number; sha256?: string }[];
}

/** Everything a page hands its folder. */
export interface WorkspaceProps {
  scope: string;
  id: string;
  course: string;
  template: WorkspaceTemplateInfo;
  tree: StartingTree;
  /** The compiler page whose folder it is, or null (the playground). */
  compilerHref: string | null;
}

export type WorkspaceStatus = "absent" | "files" | "error";

/** The language a file is read as: the tokenizer's id (lib/tokenize.mjs),
    or "text" for plain text. */
export function fileLanguage(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === "dockerfile" || name.endsWith(".dockerfile")) return "dockerfile";
  if (name === "makefile") return "makefile";
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) return "env";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return LANGUAGES[ext] ?? "text";
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  pyi: "python",
  go: "go",
  java: "java",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  bats: "bash",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  html: "html",
  htm: "html",
  ejs: "html",
  css: "css",
  xml: "xml",
  svg: "xml",
  http: "http",
  rest: "http",
  toml: "toml",
  properties: "properties",
  ini: "properties",
  env: "env",
};
