// Plain-text tables for the terminal: each column as wide as its widest cell, numbers lined
// up on the right, two spaces between columns, and no spaces at the ends of lines.
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
