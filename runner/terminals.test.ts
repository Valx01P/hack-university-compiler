import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { hasTmuxSession, killTmuxSession, tmuxPath } from "./host-tmux.ts";
import { TerminalSession, hostShellEnv, type TermSocket } from "./terminals.ts";
import { shellPlace } from "./workspaces.ts";

/**
 * Host shells, the compiler's Terminal: a real pseudo-terminal on this
 * computer, in its folder, at the terminal's size, with typing, a resize, and
 * an end that takes its jobs along, and kept in tmux when it's there. They
 * run sh with a temporary home, so no one's own profile is involved, and
 * tmux on a server of the test's own. (Container shells are in
 * workspaces.test.ts.)
 */

const skip = process.platform === "win32" ? "needs a POSIX shell" : false;
const skipTmux = skip || (tmuxPath() ? false : "needs tmux");

function fakeSocket() {
  const texts: Record<string, unknown>[] = [];
  const bytes: Buffer[] = [];
  const socket: TermSocket = {
    sendText: (m) => void texts.push(m),
    sendBinary: (d) => void bytes.push(d),
    close: () => {},
    get buffered() {
      return 0;
    },
  };
  return { socket, texts, out: () => Buffer.concat(bytes).toString("utf8") };
}

async function until(ok: () => boolean, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return ok();
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Runs `test` with sh as the shell, in a temporary home (with `profile` as
    its .profile), and, given `tmux`, a tmux server of that name: all of it
    put back, or removed, after. */
async function inHome(test: (dir: string) => Promise<void>, { profile, tmux }: { profile?: string; tmux?: string } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "hu-host-")));
  const saved = { SHELL: process.env.SHELL, HOME: process.env.HOME, HU_TMUX_SOCKET: process.env.HU_TMUX_SOCKET };
  process.env.SHELL = "/bin/sh";
  process.env.HOME = dir;
  if (tmux) process.env.HU_TMUX_SOCKET = tmux;
  if (profile) fs.writeFileSync(path.join(dir, ".profile"), profile);
  try {
    await test(dir);
  } finally {
    const bin = tmux ? tmuxPath() : null;
    if (tmux && bin) {
      try {
        execFileSync(bin, ["-L", tmux, "kill-server"], { stdio: "ignore" });
      } catch {
        /* already gone */
      }
      fs.rmSync(path.join(process.env.TMUX_TMPDIR || "/tmp", `tmux-${process.getuid?.() ?? 0}`, tmux), { force: true });
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // A shell's last writes (its history) can land as it ends.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** A prompt that starts with a blank line, the way Starship's add_newline
    does, set where a login shell reads it (the system profile sets its own). */
const BLANK_LINE_PROMPT = "PS1='\\nTOP> '\n";

/** The screen as a second terminal sees it when it attaches (the replay), as text. */
async function screen(session: TerminalSession): Promise<string[]> {
  const { socket, texts } = fakeSocket();
  await session.attach(socket, 80, 24);
  const replay = String(texts.find((m) => m.t === "replay")?.data ?? "");
  session.detach(socket, 60_000, () => {});
  return replay.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r?\n/);
}

describe("host shells", { skip }, () => {
  it("run in their folder at the terminal's size, take typing and a resize, and end with their jobs", () =>
    inHome(async (dir) => {
      let session: TerminalSession | null = TerminalSession.host({ cols: 91, rows: 20, cwd: dir });
      try {
        const { socket, texts, out } = fakeSocket();
        await session.attach(socket, 91, 20);
        assert.equal(texts[0].t, "ready");
        assert.equal(texts[0].shell, "sh");
        assert.equal(texts[0].readonly, false);

        session.input(socket, Buffer.from("pwd; stty size; echo made > made-here.txt\n"));
        assert.ok(await until(() => fs.existsSync(path.join(dir, "made-here.txt"))), out());
        assert.ok(await until(() => out().includes(dir) && /20 91/.test(out())), out());

        session.resize(socket, 100, 30);
        session.input(socket, Buffer.from("stty size\n"));
        assert.ok(await until(() => /30 100/.test(out())), out());

        // A job it started ends with it.
        session.input(socket, Buffer.from("sleep 300 & echo started-$!\n"));
        assert.ok(await until(() => /started-\d+/.test(out())), out());
        const pid = Number(/started-(\d+)/.exec(out())![1]);
        assert.ok(alive(pid));
        await session.kill();
        session = null;
        assert.ok(await until(() => !alive(pid)), "the background job outlived its shell");
      } finally {
        await session?.kill();
      }
    }));

  it("say when the shell exits, with its code", () =>
    inHome(async (dir) => {
      const session = TerminalSession.host({ cols: 80, rows: 24, cwd: dir });
      let code: number | null | undefined;
      session.onExit = (c) => (code = c);
      const { socket, texts } = fakeSocket();
      await session.attach(socket, 80, 24);
      session.input(socket, Buffer.from("exit 3\n"));
      assert.ok(await until(() => code !== undefined));
      assert.equal(code, 3);
      assert.ok(texts.some((m) => m.t === "exit" && m.code === 3));
      assert.equal(session.info.exited, true);
    }));

  it("start a prompt that begins with a blank line on the first line of an empty screen, and after clear", () =>
    inHome(
      async (dir) => {
        const session = TerminalSession.host({ cols: 80, rows: 24, cwd: dir });
        try {
          const { socket, out } = fakeSocket();
          await session.attach(socket, 80, 24);
          assert.ok(await until(() => out().includes("TOP> ")), out());
          assert.equal((await screen(session))[0], "TOP> ", "the prompt starts on the first line");

          // After output, the blank line between it and the next prompt stays.
          session.input(socket, Buffer.from("echo hi\n"));
          assert.ok(await until(() => (out().match(/TOP> /g) ?? []).length >= 2), out());
          const lines = await screen(session);
          const hi = lines.indexOf("hi");
          assert.ok(hi > 0 && lines[hi + 1] === "" && lines[hi + 2].startsWith("TOP> "), JSON.stringify(lines.slice(0, 6)));

          // clear: the prompt is back on the first line.
          session.input(socket, Buffer.from("clear\n"));
          assert.ok(await until(() => (out().match(/TOP> /g) ?? []).length >= 3), out());
          await new Promise((r) => setTimeout(r, 200));
          assert.equal((await screen(session))[0], "TOP> ", "after clear too");
        } finally {
          await session.kill();
        }
      },
      { profile: BLANK_LINE_PROMPT }
    ));

  it("get the runner's environment without the app's token, settings, or port, or an agent's session", () => {
    const env = hostShellEnv({
      PATH: "/usr/bin:/bin",
      HOME: "/home/me",
      SHELL: "/bin/zsh",
      HU_RUNNER_TOKEN: "secret",
      HU_DATA_DIR: "/data",
      npm_config_prefix: "/x",
      npm_lifecycle_event: "up",
      PORT: "3001",
      NODE_OPTIONS: "--max-http-header-size=65536",
      NEXT_TELEMETRY_DISABLED: "1",
      // An agent's session (the app started from inside Claude Code): not the shell's.
      CLAUDECODE: "1",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_SESSION_ID: "abc",
      CLAUDE_CODE_MESSAGING_TOKEN: "secret",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_EFFORT: "xhigh",
      // The user's own settings stay.
      ANTHROPIC_BASE_URL: "https://example.invalid",
      CLAUDE_CODE_USE_BEDROCK: "1",
    });
    assert.deepEqual(Object.keys(env).sort(), ["ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "COLORTERM", "HOME", "PATH", "SHELL", "TERM"]);
    assert.equal(env.TERM, "xterm-256color");
  });
});

describe("host shells kept in tmux", { skip: skipTmux }, () => {
  const open = async (dir: string, name: string) => {
    const session = TerminalSession.host({ cols: 80, rows: 24, cwd: dir, tmux: name });
    const term = fakeSocket();
    await session.attach(term.socket, 80, 24);
    return { session, ...term };
  };

  it("outlive their session: the next attaches to the same shell, its screen, and its jobs, until tmux ends it", () => {
    let job = 0;
    return inHome(
      async (dir) => {
        const name = "hu-test";
        try {
          const a = await open(dir, name);
          assert.equal(a.session.inTmux, true);
          assert.ok(await until(() => a.out().includes("TOP> "), 10_000), a.out());
          await new Promise((r) => setTimeout(r, 300));
          assert.equal((await screen(a.session))[0], "TOP> ", "in tmux too, the prompt starts on the first line");

          a.session.input(a.socket, Buffer.from("echo kept-$((40+2)); sleep 300 & echo job-$!\n"));
          assert.ok(await until(() => /job-\d+/.test(a.out())), a.out());
          job = Number(/job-(\d+)/.exec(a.out())![1]);

          // The session ends (the page gone, the runner stopping): the shell stays.
          await a.session.kill();
          assert.equal(await hasTmuxSession(name), true, "the tmux session outlived the runner's");
          assert.ok(alive(job), "and so did the shell's job");

          // The next attaches to it, its screen as it was.
          const b = await open(dir, name);
          assert.ok(await until(() => b.out().includes("kept-42"), 10_000), b.out());
          b.session.input(b.socket, Buffer.from("echo again-$((1+1))\n"));
          assert.ok(await until(() => b.out().includes("again-2")), b.out());
          await b.session.kill();

          // Ended on purpose (closed, the workspace removed): the shell and its job go.
          await killTmuxSession(name);
          assert.equal(await hasTmuxSession(name), false);
          assert.ok(await until(() => !alive(job)), "the job outlived its tmux session");
        } finally {
          if (job && alive(job)) process.kill(job, "SIGKILL");
        }
      },
      { profile: BLANK_LINE_PROMPT, tmux: `hu-test-${process.pid}` }
    );
  });

  it("end their tmux session when the shell exits", () =>
    inHome(
      async (dir) => {
        const name = "hu-test-exit";
        const { session, socket, out } = await open(dir, name);
        let code: number | null | undefined;
        session.onExit = (c) => (code = c);
        assert.ok(await until(() => out().includes("$") || out().includes("#"), 10_000), out());
        assert.equal(await hasTmuxSession(name), true);
        session.input(socket, Buffer.from("exit\n"));
        assert.ok(await until(() => code !== undefined, 10_000), "the client didn't end");
        assert.equal(await hasTmuxSession(name), false, "the tmux session outlived its shell");
      },
      { tmux: `hu-test-exit-${process.pid}` }
    ));
});

describe("where a workspace's terminals run", () => {
  it("is this computer only for the compiler's own folders, with their files here", () => {
    assert.equal(shellPlace({ scope: "compiler/java", shell: "host" }), "host");
    assert.equal(shellPlace({ scope: "compiler/java", shell: "host", storage: "host" }), "host");
    assert.equal(shellPlace({ scope: "compiler/java", shell: "host", storage: "volume" }), "container");
    assert.equal(shellPlace({ scope: "compiler/java" }), "container");
    for (const scope of ["playground/typescript", "sandbox/go-api/taskboard-api", "challenge/typescript/x", "learn/express/a/1/practice", "nonsense"]) {
      assert.equal(shellPlace({ scope, shell: "host" }), "container", scope);
    }
  });
});
