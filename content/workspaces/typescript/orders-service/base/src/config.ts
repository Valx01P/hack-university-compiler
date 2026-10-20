// The service's settings, read from the environment once, at startup. Environment variables
// are all strings or missing, so a zod schema coerces and checks each one, and a bad value
// stops the server with a readable message instead of failing in the middle of a request.
import * as z from "zod";
import { LOG_LEVELS } from "./logger.ts";

const Env = z.object({
  // The workspace sets PORT and HOST. Anywhere else the server takes 8080 on every interface.
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_PATH: z.string().min(1).default("data/bramble.db"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  API_KEYS: z.string().default(""),
  // Empty means "use the real time", which is what .env.example leaves it as.
  HU_FIXED_TIME: z.union([z.literal(""), z.iso.datetime()]).optional(),
});

export type Config = z.output<typeof Env>;

export function loadConfig(env: Readonly<Record<string, string | undefined>>): { ok: true; config: Config } | { ok: false; message: string } {
  const result = Env.safeParse(env);
  return result.success ? { ok: true, config: result.data } : { ok: false, message: z.prettifyError(result.error) };
}
