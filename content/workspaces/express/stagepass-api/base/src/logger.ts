// Structured JSON logs with pino: one object per line, which log tools can search. Redaction
// replaces secrets before a line is written, so tokens and passwords never reach log storage.
import { pino, type DestinationStream, type Logger } from "pino";
import type { Config } from "./config.ts";

export type { Logger };

export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.newPassword",
  "*.passwordHash",
  "*.accessToken",
  "*.refreshToken",
];

export function createLogger(config: Pick<Config, "logLevel">, destination?: DestinationStream): Logger {
  return pino(
    {
      level: config.logLevel,
      redact: { paths: redactPaths, censor: "[redacted]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
