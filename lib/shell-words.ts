/**
 * Command-line arguments as one line of text, for the Arguments field: split
 * the way a shell splits them (spaces separate, quotes group, a backslash
 * escapes the next character) and written back the same way.
 */

/** The arguments in a line: `logs -n 3 "meeting notes.txt"` is four. */
export function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  // Whether `current` has started, so "" counts as an argument.
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else current += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) current += line[++i];
      else current += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === "\\" && i + 1 < line.length) {
      current += line[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += c;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

/** Arguments as a line that splits back into them, quoting where needed. */
export function joinArgs(args: readonly string[]): string {
  return args.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ");
}
