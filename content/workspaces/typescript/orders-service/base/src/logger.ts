// A small JSON logger: one JSON object per line, so the Server tab, grep, and jq can all read
// it. child() returns a logger that adds its fields (such as the request id) to every line.
import type { Clock } from "./clock.ts";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  readonly debug: (msg: string, fields?: LogFields) => void;
  readonly info: (msg: string, fields?: LogFields) => void;
  readonly warn: (msg: string, fields?: LogFields) => void;
  readonly error: (msg: string, fields?: LogFields) => void;
  readonly child: (fields: LogFields) => Logger;
};

export type LoggerOptions = {
  /** The lowest level that is written. "silent" writes nothing, which tests use. */
  readonly level: LogLevel | "silent";
  readonly clock: Clock;
  readonly write?: (line: string) => void;
  readonly fields?: LogFields;
};

export function createLogger(options: LoggerOptions): Logger {
  const lowest = options.level === "silent" ? LOG_LEVELS.length : LOG_LEVELS.indexOf(options.level);
  const write =
    options.write ??
    ((line: string) => {
      process.stdout.write(`${line}\n`);
    });
  const at =
    (level: LogLevel) =>
    (msg: string, fields: LogFields = {}): void => {
      if (LOG_LEVELS.indexOf(level) < lowest) return;
      write(JSON.stringify({ time: options.clock.now().toISOString(), level, msg, ...options.fields, ...fields }));
    };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (fields) => createLogger({ ...options, fields: { ...options.fields, ...fields } }),
  };
}
