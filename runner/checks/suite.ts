import * as z from "zod";

/**
 * suite.json (architecture §6.8): the steps a check runs, each with an id the
 * `acceptance` map turns into a sentence. Every kind is accepted so content
 * can be written ahead of the runner, and the kinds this runner can't run yet
 * answer an error row (never a pass).
 */

const Id = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "is not a step id");
const Argv = z.array(z.string().max(4096)).min(1).max(64);

export const HttpCall = z.looseObject({
  method: z.string().regex(/^[A-Z]{1,16}$/),
  path: z.string().min(1).max(8192),
  headers: z.record(z.string(), z.string()).optional(),
  json: z.unknown().optional(),
  body: z.string().optional(),
  save: z.record(z.string(), z.string()).optional(),
  expect: z
    .looseObject({
      status: z.number().int().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      json: z.unknown().optional(),
      jsonExact: z.unknown().optional(),
      bodyIncludes: z.string().optional(),
    })
    .optional(),
});
export type HttpCall = z.infer<typeof HttpCall>;

export const CmdStep = z.looseObject({
  id: Id,
  kind: z.literal("cmd"),
  run: Argv,
  cwd: z.string().max(1024).optional(),
  timeoutMs: z.number().int().min(100).max(300_000).optional(),
  env: z.record(z.string(), z.string()).optional(),
  expect: z
    .looseObject({
      exit: z.number().int().optional(),
      stdout: z.string().optional(),
      stdoutRegex: z.string().optional(),
      stdoutIncludes: z.string().optional(),
      stderrIncludes: z.string().optional(),
    })
    .optional(),
  parse: z.string().optional(),
});

export const HttpStep = z.looseObject({
  id: Id,
  kind: z.literal("http"),
  as: z.string().optional(),
  steps: z.array(HttpCall).min(1).max(50),
});

const ScriptStep = z.union([
  z.looseObject({ request: HttpCall, async: z.boolean().optional(), name: z.string().optional() }),
  z.looseObject({ sleep: z.number().int().min(0).max(60_000) }),
  z.looseObject({ signal: z.enum(["TERM", "INT", "HUP", "KILL", "QUIT", "USR1", "USR2"]) }),
  z.looseObject({ await: z.union([z.string(), z.boolean()]) }),
  z.looseObject({ exit: z.looseObject({ code: z.number().int().optional(), within: z.number().int().min(0).max(60_000).optional() }) }),
  z.looseObject({ log: z.looseObject({ contains: z.string().optional(), notContains: z.string().optional() }) }),
]);

export const ProcessStep = z.looseObject({
  id: Id,
  kind: z.literal("process"),
  server: z.looseObject({ task: z.string().optional(), cmd: z.string().optional() }).optional(),
  script: z.array(ScriptStep).min(1).max(50),
});

export const Suite = z.looseObject({
  version: z.literal(1),
  image: z.string().optional(),
  db: z.enum(["clone", "empty", "none"]).optional(),
  copy: z.looseObject({ exclude: z.array(z.string().max(256)).max(64).optional(), git: z.boolean().optional() }).optional(),
  deadlineMs: z.number().int().min(1_000).max(600_000).optional(),
  server: z
    .looseObject({
      task: z.string().optional(),
      cmd: z.string().optional(),
      port: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/).optional(),
      ready: z.looseObject({ path: z.string().optional(), timeoutMs: z.number().int().min(100).max(120_000).optional() }).optional(),
    })
    .optional(),
  steps: z.array(z.looseObject({ id: Id, kind: z.string() })).min(1).max(200),
  acceptance: z.record(z.string(), z.string()).optional(),
  starterFails: z.array(z.string()).optional(),
});
export type Suite = z.infer<typeof Suite>;

export type CmdStep = z.infer<typeof CmdStep>;
export type HttpStep = z.infer<typeof HttpStep>;
export type ProcessStep = z.infer<typeof ProcessStep>;
