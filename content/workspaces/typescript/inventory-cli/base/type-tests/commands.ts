// Compile-only tests of the command registry's type. `npm run typecheck` compiles this file
// and nothing ever runs it. Each @ts-expect-error line must really be an error: if it ever
// compiles, tsc reports the unused directive (TS2578) and the check fails.
import type { Command } from "#commands/types.ts";

export const ping = {
  usage: "ping",
  summary: "Answer pong",
  run: (_args, { out }) => {
    out("pong");
    return Promise.resolve(0);
  },
} satisfies Command;

export const wrongReturn = {
  usage: "done",
  summary: "Print done",
  // @ts-expect-error -- run must resolve to an exit code, not return text
  run: () => "done",
} satisfies Command;

export const missingSummary = {
  usage: "quiet",
  run: () => Promise.resolve(0),
  // @ts-expect-error -- every command needs a summary for --help
} satisfies Command;
