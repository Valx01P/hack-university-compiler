// The settings, read from the environment once at startup and checked by a zod schema, so a
// missing or malformed value stops the server with a readable message instead of failing
// later inside a request.
import * as z from "zod";
import { LOG_LEVELS } from "./logger.ts";

const Env = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  MONGODB_URI: z.string().min(1),
  TEST_MONGODB_URI: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).default("cookbook-dev-secret"),
  SESSION_COOKIE_NAME: z.string().min(1).default("cookbook.sid"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.output<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
