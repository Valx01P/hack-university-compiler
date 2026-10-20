/**
 * The shapes the IDE shares between the server and the browser: what a page
 * tells the IDE about its workspace (lib/workspaces.ts builds it), the
 * runner's tree entries and events (architecture §3.2, §3.3), and the check
 * results schema (§7.3). Pure types and small helpers, safe anywhere.
 */

/** A task the template lets Run, Stop, and the Server panel start. */
export interface WorkspaceTask {
  name: string;
  /** What the Server panel calls it ("Server", "Program"). */
  label: string;
  /** The command, shown so you know what runs (never sent back). */
  cmd: string;
  /** Run starts this one. */
  run: boolean;
}

/** What the IDE needs to know about a template, and nothing that runs. */
export interface WorkspaceTemplateInfo {
  /** <course>/<template>. */
  id: string;
  title: string;
  layout: "ide" | "preview-first";
  /** `open` starts the container when the workspace opens. */
  start: "run" | "open";
  storage: "host" | "volume";
  tasks: WorkspaceTask[];
  ports: { env: string; label: string; readyPath?: string; preview?: boolean }[];
  /** Files opened at first, in order (README.md first). */
  open: string[];
  /** The .http file the API panel lists first. */
  requests: string | null;
  readonly: string[];
  hidden: string[];
  panels: string[];
  autosave: boolean;
  /** Databases the workspace gets. */
  services: string[];
  /** Whether a check suite exists for this scope. */
  checks: boolean;
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
  /** Made by a tool (sqlc's output): opens read only. */
  generated?: string | boolean;
}

/** The tree a page paints first: the starting point's files, from
    .generated/workspaces (scripts/build-content.mjs). */
export interface StartingTree {
  hash: string;
  entries: { path: string; type: "file" | "dir"; size?: number; mode?: number; sha256?: string }[];
}

/** Everything a page hands the IDE. */
export interface WorkspaceProps {
  scope: string;
  id: string;
  course: string;
  template: WorkspaceTemplateInfo;
  tree: StartingTree;
  /** Where Back to the compiler goes. */
  compilerHref: string | null;
}

export type WorkspaceStatus = "absent" | "files" | "stopped" | "starting" | "running" | "stopping" | "error";

/** A port the workspace serves on (one number inside and out, §4.2.6). */
export interface PortInfo {
  port: number;
  url: string;
  state: "listening" | "closed";
  bind?: string;
  process?: string;
  framable?: boolean;
  reason?: string;
  label?: string;
  /** Why it isn't the number the server asked for. */
  note?: string;
}

/** One acceptance criterion's result (§7.3). */
export interface CheckTest {
  id: string;
  title: string;
  kind?: string;
  status: "pass" | "fail" | "error" | "skip";
  message?: string;
  expected?: string;
  actual?: string;
  request?: { method: string; path: string; headers?: Record<string, string>; body?: string };
  response?: { status: number; headers?: Record<string, string>; body?: string };
  location?: { file: string; line: number };
  ms?: number;
}

export interface CheckResult {
  version?: number;
  checkId: string;
  status: "passed" | "failed" | "error" | "timeout";
  durationMs?: number;
  tests: CheckTest[];
  infra: null | { kind: string; message?: string; output?: string };
  logs?: { server?: string; build?: string };
}

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
