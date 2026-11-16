import { countColumn, type Extension } from "@codemirror/state";
import { indentService, type IndentContext } from "@codemirror/language";
import { languageId } from "@/lib/tokenize.mjs";

/**
 * Enter keeps a finished line's level. The Java and JavaScript grammars read
 * a statement that has no `;` yet (`System.out.println("hi")`, `int x = 5`)
 * as one that carries on to the next line, and indent the next line one more
 * for it. Here a line that looks finished (its brackets closed, not ending
 * in an operator, a comma, or a colon) gives the next line its own level
 * instead, and a line ending in an opening bracket one level more. The rest
 * stays with the grammar, which knows the structure: a closing bracket
 * coming next, an unfinished list or expression, a line that closes what an
 * earlier one opened, comments, and blank lines.
 *
 * YAML gets the other half: its grammar leaves the line after `key:` at the
 * key's level, but a key ending its line opens a nested value, so the next
 * line goes one level past the key (past the key after `- ` in a list too).
 *
 * The other languages' grammars (Go, Python, Bash, SQL, CSS, JSON, HTML, and
 * the rest) already keep a finished line's level.
 */

// The brace languages. C++'s grammar already gets these right, and it's
// here so the rules are the same in every brace language.
const LANGUAGES = new Set(["java", "javascript", "typescript", "jsx", "tsx", "cpp"]);

// A line's code, for counting: strings turn into empty quotes, comments go.
function code(text: string): string {
  return text
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/\/\*.*?\*\//g, "")
    .replace(/\/\/.*$/, "")
    .trimEnd();
}

function indentAfterLine(context: IndentContext, pos: number): number | undefined {
  // The line before: the part before a line break being made here, else the
  // line above the one being indented.
  const before = context.simulatedBreak === pos ? context.lineAt(pos, -1) : pos > 0 ? context.lineAt(pos - 1, -1) : null;
  if (!before) return undefined;
  if (/^[)\]}]/.test(context.textAfterPos(pos).trimStart())) return undefined;
  const start = before.text.trimStart();
  // Blank, or inside a block comment.
  if (!start || start.startsWith("*") || start.startsWith("/*")) return undefined;
  const line = code(before.text);
  if (!line.trim()) return undefined;
  const level = countColumn(/^\s*/.exec(before.text)![0], context.state.tabSize);
  if (/[([{]$/.test(line)) return level + context.unit;
  let depth = 0;
  for (const ch of line) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
  }
  if (depth !== 0) return undefined;
  // Ends in an operator, a comma, a dot, or a colon: it goes on (i++ and
  // i-- don't).
  if (/(?:[-+*/%&|^=<>!?:,.~])$/.test(line) && !/(?:\+\+|--)$/.test(line)) return undefined;
  return level;
}

function indentAfterYamlKey(context: IndentContext, pos: number): number | undefined {
  const before = context.simulatedBreak === pos ? context.lineAt(pos, -1) : pos > 0 ? context.lineAt(pos - 1, -1) : null;
  if (!before) return undefined;
  // The line without its comment (a # after a space, outside quotes) and
  // with its strings emptied, so a colon inside them doesn't count.
  const line = before.text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g, '""').replace(/(^|\s)#.*$/, "").trimEnd();
  if (!line.endsWith(":")) return undefined;
  // The key's own column: after the list dashes in `- key:`.
  const key = /^[\s-]*/.exec(line)![0];
  return countColumn(key.replace(/-/g, " "), context.state.tabSize) + context.unit;
}

/** The rules above, for the brace languages and YAML (nothing for the rest). */
export function indentRules(language: string): Extension {
  const id = languageId(language);
  if (LANGUAGES.has(id)) return indentService.of(indentAfterLine);
  if (id === "yaml") return indentService.of(indentAfterYamlKey);
  return [];
}
