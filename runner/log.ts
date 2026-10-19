import { closeSync, fstatSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs";
import path from "node:path";

/**
 * The runner's log, ~/.hack-university/logs/runner.log, one line per event:
 *
 *   2026-10-19T18:00:00.000Z info job.done id=hu-job-1f2e recipe=typescript ms=312
 *
 * It rolls over to runner.log.1 at 10 MB. Warnings and errors also go to
 * stderr, so `npm run up` shows them. Tokens and tickets are never logged.
 */
const MAX_BYTES = 10 * 1024 * 1024;

type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

export class Log {
  private fd = -1;
  private size = 0;
  private readonly file: string;
  private readonly echo: boolean;

  constructor(dataDir: string, echo = true) {
    this.echo = echo;
    const dir = path.join(dataDir, "logs");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, "runner.log");
  }

  info(event: string, fields: Fields = {}) {
    this.write("info", event, fields);
  }

  warn(event: string, fields: Fields = {}) {
    this.write("warn", event, fields);
  }

  error(event: string, fields: Fields = {}) {
    this.write("error", event, fields);
  }

  private write(level: Level, event: string, fields: Fields) {
    let line = `${new Date().toISOString()} ${level} ${event}`;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      const text = String(value);
      line += ` ${key}=${/[\s"=]/.test(text) || text === "" ? JSON.stringify(text) : text}`;
    }
    line += "\n";
    if (this.echo && level !== "info") process.stderr.write(`hu-runner: ${line.slice(25)}`);
    try {
      if (this.fd < 0) this.open();
      if (this.size + line.length > MAX_BYTES) {
        closeSync(this.fd);
        renameSync(this.file, `${this.file}.1`);
        this.open();
      }
      this.size += writeSync(this.fd, line);
    } catch {
      /* a full disk must not take the runner down with it */
    }
  }

  private open() {
    this.fd = openSync(this.file, "a", 0o600);
    this.size = fstatSync(this.fd).size;
  }
}

/** A log that drops everything, for tests. */
export const quietLog = {
  info() {},
  warn() {},
  error() {},
} as unknown as Log;
