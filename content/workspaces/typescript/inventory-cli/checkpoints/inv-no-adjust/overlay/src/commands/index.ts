// The command registry: the word you type, mapped to the code that runs. `satisfies` checks
// every entry against Command without widening the object, so each command keeps its own
// type and a command with the wrong shape is a compile error right here.
import { add } from "./add.ts";
import { list } from "./list.ts";
import { remove } from "./remove.ts";
import { report } from "./report.ts";
import type { Command } from "./types.ts";

// TODO (lesson 26, part 2): register adjust once src/commands/adjust.ts exists.
export const commands = { list, add, remove, report } satisfies Record<string, Command>;

export type CommandName = keyof typeof commands;

export function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(commands, name);
}
