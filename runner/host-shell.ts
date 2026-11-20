/**
 * What tmux runs for a host shell kept in it (runner/host-tmux.ts): your
 * login shell on a pty of its own, its output passed on with the line feed
 * that would leave a blank first line dropped (runner/blank-top.ts). tmux
 * draws the screen itself, so that can't be done after it, in the runner.
 *
 *   node host-shell.ts <shell>
 *
 * It lives in tmux's server, so it outlives the runner (the app restarting,
 * the browser gone). It ends with the shell, and ends the shell when tmux
 * ends it (the session killed: a hangup).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import headless from "@xterm/headless";
import { dropBlankTop, mayBlank } from "./blank-top.ts";
import { hangUpTerminal, loadPty, withoutAgentSession } from "./pty.ts";

const { Terminal } = headless;

const shell = process.argv[2] || process.env.SHELL || "/bin/sh";
const size = () => ({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 });
const { cols, rows } = size();

// tmux's server keeps the environment it started with, which may hold an
// AI agent's session markers (the app started from inside one): not the
// shell's (runner/pty.ts). And this tmux passes 24-bit color through
// (runner/tmux.conf), which Claude Code won't assume in tmux, drawing in 256
// colors instead (its orange a pale pink) unless told.
const env = { ...withoutAgentSession(process.env), CLAUDE_CODE_TMUX_TRUECOLOR: "1" };
const pty = loadPty().spawn(shell, ["-l"], { name: process.env.TERM || "xterm-256color", cols, rows, cwd: process.cwd(), env });
const mirror = new Terminal({ cols, rows, scrollback: 100, allowProposedApi: true });

let shown: Promise<void> = Promise.resolve();
pty.onData((data) => {
  shown = shown
    .then(async () => {
      if (!mayBlank(mirror, data)) {
        mirror.write(data);
        process.stdout.write(data);
        return;
      }
      process.stdout.write(await dropBlankTop(mirror, data));
    })
    .catch(() => {});
});
// The shell exited (exit): so does this, once its output is shown, and tmux
// ends the session. Outright, not through Node's own exit, which stalls
// closing the shell's pty (and would keep the session, and the page's
// Terminal, waiting). Writes to a terminal are synchronous, so what's been
// written is shown.
pty.onExit(() => {
  void shown.then(() => process.kill(process.pid, "SIGKILL"));
});

// Keys straight through: raw input, set with stty and read as a plain
// stream, not through Node's tty, which puts the terminal's mode back when
// its input ends and waits for the output to drain doing it. Once tmux has
// closed the pane, that wait never ends, and nothing else here runs.
try {
  execFileSync("stty", ["raw", "-echo"], { stdio: ["inherit", "ignore", "ignore"] });
} catch {
  /* not a terminal */
}
const decoder = new StringDecoder("utf8");
const input = fs.createReadStream("/dev/stdin", { fd: 0, autoClose: false });
input.on("data", (chunk) => {
  const text = decoder.write(chunk as Buffer);
  if (text) pty.write(text);
});
input.on("end", () => end());
input.on("error", () => end());
process.stdout.on("error", () => end());

process.stdout.on("resize", () => {
  const next = size();
  mirror.resize(next.cols, next.rows);
  try {
    pty.resize(next.cols, next.rows);
  } catch {
    /* it just exited */
  }
});

// tmux ended the session (or the pane): the shell and its jobs go too, a
// hangup to everything on the shell's terminal and a kill to what's left
// (runner/pty.ts). It's all done at once, without the event loop: with its
// terminal gone, Node can stall in it (closing its streams), which would
// keep the shell's pty open, and the shell with it. Then this goes
// outright, for the same reason.
let ending = false;
function end() {
  if (ending) return;
  ending = true;
  hangUpTerminal(pty.pid);
  process.kill(process.pid, "SIGKILL");
}
for (const signal of ["SIGHUP", "SIGTERM"] as const) process.on(signal, end);
