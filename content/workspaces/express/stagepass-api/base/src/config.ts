// The only module that reads environment variables. loadConfig() checks them all at once with
// zod and lists every problem by variable name, so a bad deploy fails at startup with a clear
// message instead of halfway through a request.
import { resolve } from "node:path";
import { z } from "zod";

// Known secrets for development and tests only. Production must set JWT_SECRET itself.
export const DEV_JWT_SECRET = "stagepass-development-secret-0123456789";
export const TEST_JWT_SECRET = "stagepass-test-secret-0123456789abcdef";

// An empty value counts as unset, so `HU_FIXED_TIME=` in .env means "no fixed time".
const blankAsUnset = (value: unknown) => (value === "" ? undefined : value);

const origin = z.string().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
  message: "Expected an origin such as http://localhost:5173 (scheme, host, and port, no path)",
});

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "Expected a postgres:// connection URL" }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JWT_SECRET: z.preprocess(blankAsUnset, z.string().min(32, "Use at least 32 characters").optional()),
  JWT_ISSUER: z.string().min(1).default("stagepass"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(origin)),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((value): boolean | number | string => {
      if (value === "" || value === "false") return false;
      if (value === "true") return true;
      return /^\d+$/.test(value) ? Number(value) : value;
    }),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  MIGRATE_ON_START: z.stringbool().default(false),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).max(100_000).default(300),
  HU_FIXED_TIME: z.preprocess(blankAsUnset, z.iso.datetime({ offset: true }).optional()),
  HU_RACE_DELAY_MS: z.coerce.number().int().min(0).max(5_000).default(0),
  HU_PREVIEW_PARENT: z.preprocess(blankAsUnset, origin.optional()),
  SHUTDOWN_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(65_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(600_000).default(15_000),
});

export type Config = {
  env: "development" | "test" | "production";
  isProduction: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: z.infer<typeof EnvSchema>["LOG_LEVEL"];
  jwt: { secret: string; issuer: string; audience: string; accessTokenTtlSeconds: number };
  refreshTokenTtlDays: number;
  corsOrigins: string[];
  trustProxy: boolean | number | string;
  /** Requests per minute per address on /v1. 0 turns the general limit off (logins stay limited). */
  apiRateLimitPerMinute: number;
  uploadDir: string;
  migrateOnStart: boolean;
  fixedTime: Date | null;
  raceDelayMs: number;
  previewParent: string | null;
  // X-Query-Count on every response, for spotting N+1 queries. Never in production.
  queryCountHeader: boolean;
  shutdown: { delayMs: number; timeoutMs: number };
  http: { keepAliveTimeoutMs: number; headersTimeoutMs: number; requestTimeoutMs: number };
  db: { statementTimeoutMs: number };
  /** JSON.stringify and the logger call this, so secrets never reach a log line. */
  toJSON(): Record<string, unknown>;
};

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error);
    const problems = Object.entries(fieldErrors).map(([name, messages]) => `${name}: ${messages?.join("; ")}`);
    throw new ConfigError(problems);
  }
  const e = result.data;
  if (e.NODE_ENV === "production" && e.JWT_SECRET === undefined) {
    throw new ConfigError(["JWT_SECRET: Required in production"]);
  }

  const config: Config = {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === "production",
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    jwt: {
      secret: e.JWT_SECRET ?? (e.NODE_ENV === "test" ? TEST_JWT_SECRET : DEV_JWT_SECRET),
      issuer: e.JWT_ISSUER,
      audience: "stagepass-api",
      accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    },
    refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    corsOrigins: e.CORS_ORIGINS,
    trustProxy: e.TRUST_PROXY,
    apiRateLimitPerMinute: e.API_RATE_LIMIT_PER_MINUTE,
    uploadDir: resolve(e.UPLOAD_DIR),
    migrateOnStart: e.MIGRATE_ON_START,
    fixedTime: e.HU_FIXED_TIME === undefined ? null : new Date(e.HU_FIXED_TIME),
    raceDelayMs: e.HU_RACE_DELAY_MS,
    previewParent: e.NODE_ENV === "production" ? null : (e.HU_PREVIEW_PARENT ?? null),
    queryCountHeader: e.NODE_ENV !== "production",
    shutdown: { delayMs: e.SHUTDOWN_DELAY_MS, timeoutMs: e.SHUTDOWN_TIMEOUT_MS },
    http: {
      keepAliveTimeoutMs: e.KEEP_ALIVE_TIMEOUT_MS,
      // Node requires headersTimeout <= requestTimeout. Both bound slow clients.
      headersTimeoutMs: 20_000,
      requestTimeoutMs: 60_000,
    },
    db: { statementTimeoutMs: e.DB_STATEMENT_TIMEOUT_MS },
    toJSON() {
      const url = new URL(this.databaseUrl);
      if (url.password) url.password = "redacted";
      const { toJSON: _toJSON, ...settings } = this;
      return { ...settings, databaseUrl: url.toString(), jwt: { ...this.jwt, secret: "[redacted]" } };
    },
  };
  return config;
}
