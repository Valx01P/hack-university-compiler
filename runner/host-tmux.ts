import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Host shells kept in tmux (the compiler's Terminal), so they outlive the
 * page and the app: leaving, closing the browser, or restarting npm run up
 * ends only the tmux client the runner runs on its pty, and the shell (and
 * Claude Code, or whatever runs in it) keeps going in tmux's server. Opening
 * the Terminal again attaches to it, one session per workspace (hu-<id>),
 * its screen as you left it. The shell ending (exit) ends the session, and
 * so do closing the terminal and removing the workspace.
 *
 * It's tmux's own server (tmux -L hack-university, HU_TMUX_SOCKET in the
 * tests) with its own config (runner/tmux.conf: no status bar, no keys), so
 * your own tmux is never touched. Without tmux (Windows, or not installed,
 * or HU_HOST_TMUX=0) a host shell runs straight on the pty and ends with it.
 */

const HERE = import.meta.dirname;
const CONF = path.join(HERE, "tmux.conf");
const SHELL_WRAPPER = path.join(HERE, "host-shell.ts");
const socket = () => process.env.HU_TMUX_SOCKET || "hack-university";

let found: string | null | undefined;

/** tmux on this computer, or null. */
export function tmuxPath(): string | null {
  if (process.env.HU_HOST_TMUX === "0" || process.platform === "win32") return null;
  if (found !== undefined) return found;
  found = null;
  // npm run up's PATH, then where Homebrew and systems put it.
  for (const dir of [...(process.env.PATH ?? "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) {
    if (!dir) continue;
    const file = path.join(dir, "tmux");
    try {
      fs.accessSync(file, fs.constants.X_OK);
      found = file;
      break;
    } catch {
      /* not here */
    }
  }
  return found;
}

/** A workspace's session name. */
export const tmuxSession = (workspaceId: string) => `hu-${workspaceId}`;

/** The client the runner runs on its pty: attaches to the session, or makes
    it, in `cwd`, running `shell` through host-shell.ts. */
export function tmuxClient(tmux: string, name: string, cwd: string, shell: string): { file: string; args: string[] } {
  return {
    file: tmux,
    args: ["-L", socket(), "-f", CONF, "new-session", "-A", "-s", name, "-c", cwd, "--", process.execPath, "--no-warnings", SHELL_WRAPPER, shell],
  };
}

function run(args: string[]): Promise<boolean> {
  const tmux = tmuxPath();
  if (!tmux) return Promise.resolve(false);
  return new Promise((resolve) => execFile(tmux, ["-L", socket(), ...args], { timeout: 5_000 }, (err) => resolve(!err)));
}

/** Reads tmux.conf again into tmux's server when one is running: -f is read
    only when the server starts, and it outlives the app (an update's new
    settings would wait for every session to end). Each client takes them as
    it attaches. Best effort: no server, or no tmux, is fine. */
export const loadTmuxConfig = () => run(["source-file", CONF]);

/** Whether the session is there (still running). */
export const hasTmuxSession = (name: string) => run(["has-session", "-t", `=${name}`]);

/** Ends the session, and the shell and everything in it. */
export async function killTmuxSession(name: string): Promise<void> {
  await run(["kill-session", "-t", `=${name}`]);
}
