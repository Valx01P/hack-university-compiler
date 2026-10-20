// CSV in and out, with the quoting rules spreadsheets use: a cell that holds a comma, a
// quote, or a line break is wrapped in quotes, and each quote inside it is doubled.
const NEEDS_QUOTES = /[",\r\n]/;

function quote(cell: string): string {
  return cell;
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
