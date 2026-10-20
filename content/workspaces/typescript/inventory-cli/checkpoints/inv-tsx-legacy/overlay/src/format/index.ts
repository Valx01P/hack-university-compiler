// The output formats, kept in one namespace from before the project used modules for this.
// A namespace that holds functions is an object at runtime, so Node's type stripping cannot
// run it: tsx compiles it instead.
export namespace Format {
  export type Column = {
    readonly header: string;
    readonly align?: "left" | "right";
  };

  export function formatTable(rows: readonly (readonly string[])[], columns: readonly Column[]): string {
    const widths = columns.map((column, i) => Math.max(column.header.length, ...rows.map((row) => (row[i] ?? "").length)));
    const line = (cells: readonly string[]): string =>
      columns
        .map((column, i) => {
          const cell = cells[i] ?? "";
          const width = widths[i] ?? cell.length;
          return column.align === "right" ? cell.padStart(width) : cell.padEnd(width);
        })
        .join("  ")
        .trimEnd();
    return [line(columns.map((column) => column.header)), ...rows.map(line)].join("\n");
  }

  const NEEDS_QUOTES = /[",\r\n]/;

  function quote(cell: string): string {
    return NEEDS_QUOTES.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
  }

  export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
    return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n") + "\n";
  }

  /** Splits CSV text into rows of cells. A blank last line is not a row. */
  export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (quoted) {
        if (char === '"' && text.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n" || char === "\r") {
        // \r\n ends one row, not two.
        if (char === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell !== "" || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  const cell = (text: string): string => text.replaceAll("|", "\\|");

  export function toMarkdownTable(rows: readonly (readonly string[])[], columns: readonly Column[]): string {
    const line = (cells: readonly string[]): string => `| ${cells.map(cell).join(" | ")} |`;
    return [
      line(columns.map((column) => column.header)),
      `| ${columns.map((column) => (column.align === "right" ? "---:" : "---")).join(" | ")} |`,
      ...rows.map(line),
    ].join("\n");
  }
}
