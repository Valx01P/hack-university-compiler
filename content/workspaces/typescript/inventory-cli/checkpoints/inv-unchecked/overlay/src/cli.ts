// Stockroom's entry point: `node src/cli.ts <command> [options]`. It reads the settings,
// finds the command, runs it, and turns a CliError into a message on stderr and an exit
// code. A command gets everything it needs through its context (store, clock, output), so
// tests can run one without a terminal or the real data file.
import { commands, isCommandName } from "#commands/index.ts";
import { JsonStore } from "#storage/json-store.ts";
import pkg from "../package.json" with { type: "json" };
import { loadConfig } from "./config.ts";
import { CliError, InvalidInputError } from "./errors.ts";

function usage(): string {
  const all = Object.values(commands);
  const width = Math.max(...all.map((command) => command.usage.length));
  return [
    `Stockroom ${pkg.version} keeps track of the shop's stock.`,
    "",
    "Usage: node src/cli.ts <command> [options]",
    "",
    "Commands:",
    ...all.map((command) => `  ${command.usage.padEnd(width)}  ${command.summary}`),
    "",
    "Settings come from the environment (see .env.example): STOCKROOM_DATA, STOCKROOM_LOW_STOCK, HU_FIXED_TIME.",
  ].join("\n");
}

// util.parseArgs reads "-3" as an unknown option. Numbers are never options here, so a
// negative number moves behind "--", where every argument counts as a positional.
function negativeNumbersLast(args: readonly string[]): string[] {
  const isNegative = (arg: string): boolean => /^-\d+$/.test(arg);
  const numbers = args.filter(isNegative);
  return numbers.length === 0 ? [...args] : [...args.filter((arg) => !isNegative(arg)), "--", ...numbers];
}

function isParseArgsError(error: unknown): error is TypeError {
  return error instanceof TypeError && "code" in error && typeof error.code === "string" && error.code.startsWith("ERR_PARSE_ARGS_");
}

async function main(argv: readonly string[]): Promise<number> {
  const name = argv[0];
  const rest = argv.slice(1);
  if (name === "help" || name === "--help" || name === "-h") {
    console.log(usage());
    return 0;
  }
  if (name === "--version" || name === "-v") {
    console.log(`stockroom ${pkg.version}`);
    return 0;
  }
  if (!isCommandName(name)) throw new InvalidInputError(`Unknown command: ${name}. Run "node src/cli.ts --help" to see the commands.`);
  const command = commands[name];
  const config = loadConfig(process.env, process.cwd());
  try {
    return await command.run(negativeNumbersLast(rest), {
      store: new JsonStore(config.dataPath),
      clock: config.clock,
      lowStock: config.lowStock,
      out: (line) => {
        console.log(line);
      },
    });
  } catch (error) {
    if (isParseArgsError(error)) throw new InvalidInputError(`${error.message}\nUsage: node src/cli.ts ${command.usage}`);
    throw error;
  }
}

// A CliError is an expected failure: print its message and give back its exit code.
function exitCodeFor(error: unknown): number | undefined {
  if (error instanceof CliError) {
    console.error(error.message);
    return error.exitCode;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  // Anything that is not a CliError is a bug, so it is thrown again and Node prints the
  // whole stack trace.
  const code = exitCodeFor(error);
  if (code === undefined) throw error;
  process.exitCode = code;
}
