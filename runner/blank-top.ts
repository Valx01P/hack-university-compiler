import type { Terminal } from "@xterm/headless";

/**
 * A host shell's output, minus a line feed that would leave a blank first
 * line on an empty screen. Many prompts start with a blank line, to space
 * them from the output before (Starship's add_newline, most two-line themes),
 * and on an empty screen that's a wasted line above the prompt: dropped, the
 * prompt starts on the first line, beside an editor's first. It holds at the
 * start, after clear, and when the shell redraws its prompt after a resize,
 * which clears from the top and sends that same line feed again.
 *
 * `mirror` is a headless terminal kept in step with what's been shown: the
 * runner's own (a shell straight on a pty, runner/terminals.ts), or the one
 * in runner/host-shell.ts (a shell inside tmux, where tmux draws the screen
 * and the runner can't take anything out of what it sends).
 */

/** Whether the screen is empty with the cursor on its first line (the normal
    screen only: full-screen programs use the alternate one). */
export function blankTop(mirror: Terminal): boolean {
  const b = mirror.buffer.active;
  if (b.type !== "normal" || b.cursorY !== 0) return false;
  for (let y = 0; y < mirror.rows; y++) if (b.getLine(b.baseY + y)?.translateToString(true).trim()) return false;
  return true;
}

/** Output that can't leave the screen empty (no erase in it, the screen not
    empty now): it goes straight through. */
export const mayBlank = (mirror: Terminal, data: string) => blankTop(mirror) || /\x1b\[[0-3]?J|\x1bc/.test(data);

/** `data` written to the mirror, and returned, minus those line feeds. */
export async function dropBlankTop(mirror: Terminal, data: string): Promise<string> {
  const write = (text: string) => new Promise<void>((resolve) => mirror.write(text, resolve));
  let out = "";
  let from = 0;
  for (let i = data.indexOf("\n"); i !== -1; i = data.indexOf("\n", i + 1)) {
    const before = data.slice(from, i);
    if (before) {
      await write(before);
      out += before;
    }
    from = i + 1;
    if (blankTop(mirror)) continue;
    await write("\n");
    out += "\n";
  }
  const rest = data.slice(from);
  if (rest) {
    await write(rest);
    out += rest;
  }
  return out;
}
