// The ways a command can fail on purpose. cli.ts prints the message on stderr and exits
// with exitCode, so a script can tell a typo (2) from a missing item (3) from a broken
// data file (1). Anything else that is thrown is a bug, and crashes with a stack trace.
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** Bad input on the command line: a malformed SKU, an unknown category. Exit code 2. */
export class InvalidInputError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = "InvalidInputError";
  }
}

/** The command names an item the inventory does not have. Exit code 3. */
export class NotFoundError extends CliError {
  constructor(message: string) {
    super(message, 3);
    this.name = "NotFoundError";
  }
}

/** For the default branch of a switch that handles every member of a union. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
