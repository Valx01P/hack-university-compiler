// What a command is. The registry in index.ts checks every command against Command, so a
// command that forgets to resolve to its exit code does not compile.
import type { Store } from "#storage/json-store.ts";
import type { Clock } from "../clock.ts";

export type CommandContext = {
  readonly store: Store;
  readonly clock: Clock;
  /** Items at or below this quantity are low (STOCKROOM_LOW_STOCK). */
  readonly lowStock: number;
  /** Prints one line: stdout in the real CLI, an array in a test. */
  readonly out: (line: string) => void;
};

export type Command = {
  readonly usage: string;
  readonly summary: string;
  /** Parses its own arguments, does the work, and resolves to the exit code. */
  readonly run: (args: readonly string[], context: CommandContext) => Promise<number>;
};
