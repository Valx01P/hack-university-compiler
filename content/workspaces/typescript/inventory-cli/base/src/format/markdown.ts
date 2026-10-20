// Markdown tables, for pasting a report into an issue or a wiki page. Number columns are
// right-aligned with ---:, and a | inside a cell is escaped so it cannot end the cell.
import type { Column } from "./table.ts";

const cell = (text: string): string => text.replaceAll("|", "\\|");

export function toMarkdownTable(rows: readonly (readonly string[])[], columns: readonly Column[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.map(cell).join(" | ")} |`;
  return [
    line(columns.map((column) => column.header)),
    `| ${columns.map((column) => (column.align === "right" ? "---:" : "---")).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}
