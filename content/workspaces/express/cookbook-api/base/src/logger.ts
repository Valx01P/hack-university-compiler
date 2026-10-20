// The application logger: pino, writing one JSON line per event. In development it is pretty-
// printed; in test and production it stays JSON. Secrets are redacted so a request log never
// carries a password, cookie, or token.
import { pino } from "pino";
import { now } from "./clock.ts";

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LoggerOptions = {
  level: LogLevel;
  pretty: boolean;
};

export function createLogger(options: LoggerOptions) {
  return pino({
    level: options.level,
    timestamp: () => `,"time":"${now().toISOString()}"`,
    redact: ["req.headers.cookie", "req.headers.authorization", "password", "*.password"],
    ...(options.pretty
      ? { transport: { target: "pino-pretty", options: { translateTime: false, ignore: "pid,hostname" } } }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
