import type { ForbidRule } from "../schemas.ts";

/**
 * The honesty rules a TypeScript practice can forbid (outlines/typescript.md
 * §8.1): `any`, `as` (except `as const`), the non-null `!`, and comments that
 * silence the checker. A program that type-checks by lying to the checker
 * doesn't pass.
 *
 * A token scan, not a parser, but a careful one: strings, the text of
 * template literals, regular expressions, and comments are skipped, so
 * `"as any"` and `/as/` never count, while the code inside a template's ${...}
 * is checked like any other. Names are not flagged:
 * `Promise.any`, `{ any: 1 }`, and a parameter called `as` are fine, and so
 * are `import * as z` and `export { a as b }`. Old angle-bracket assertions
 * (`<T>x`) look like generics to a token scan, so they aren't caught.
 */

export interface HonestyHit {
  rule: ForbidRule;
  /** 1-based line and column of the token. */
  line: number;
  col: number;
  message: string;
}

export const HONESTY_MESSAGES: Record<ForbidRule, string> = {
  any: "any switches type checking off. Give this a real type, or use unknown and narrow it.",
  as: "A type assertion (as) makes the checker trust you. Fix the type instead of asserting it.",
  "non-null": "The non-null assertion (!) hides a value that may be undefined. Check for it instead.",
  "ts-comments": "This comment silences the type checker. Fix the type error instead.",
};

type TokenType = "ident" | "punct" | "string" | "template" | "regex" | "number" | "comment";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  /** A line break comes between this token and the one before it. */
  newlineBefore: boolean;
}

// Words after which a / starts a regular expression and a ! is the prefix not.
const PREFIX_KEYWORDS = new Set([
  "return", "typeof", "void", "delete", "await", "yield", "throw", "case", "in", "of", "instanceof",
  "else", "do", "new", "extends", "keyof", "satisfies", "as", "is",
]);
// Keywords that end an expression, so a ! after them is postfix.
const VALUE_KEYWORDS = new Set(["this", "super", "null", "undefined", "true", "false"]);
const RESERVED = new Set([
  ...PREFIX_KEYWORDS, "break", "catch", "class", "const", "continue", "debugger", "default", "enum", "export",
  "finally", "for", "function", "if", "import", "let", "switch", "try", "var", "while", "with", "static",
]);

const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_PART = /[\p{ID_Continue}$‌‍]/u;

/** Splits TypeScript source into tokens, comments included. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let newline = false;
  // One entry per open template ${...}: the brace depth it closes at.
  const templates: number[] = [];
  let depth = 0;

  const advance = (n: number) => {
    for (let k = 0; k < n && i < src.length; k++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const push = (type: TokenType, start: number, startLine: number, startCol: number) => {
    tokens.push({ type, value: src.slice(start, i), line: startLine, col: startCol, newlineBefore: newline });
    newline = false;
  };
  const prevSignificant = () => {
    for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].type !== "comment") return tokens[k];
    return undefined;
  };
  const regexAllowed = () => {
    const prev = prevSignificant();
    if (!prev) return true;
    if (prev.type === "ident") return RESERVED.has(prev.value) && !VALUE_KEYWORDS.has(prev.value);
    if (prev.type === "punct") return !/^[)\]]$/.test(prev.value);
    return false;
  };
  // Scans template characters up to the closing backtick or the next ${.
  const templateRest = (start: number, startLine: number, startCol: number) => {
    while (i < src.length) {
      if (src[i] === "\\") advance(2);
      else if (src[i] === "`") {
        advance(1);
        push("template", start, startLine, startCol);
        return;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        advance(2);
        push("template", start, startLine, startCol);
        templates.push(depth);
        depth++;
        return;
      } else advance(1);
    }
    push("template", start, startLine, startCol);
  };

  while (i < src.length) {
    const ch = src[i];
    const start = i;
    const startLine = line;
    const startCol = col;
    if (ch === "\n") {
      newline = true;
      advance(1);
    } else if (/\s/.test(ch)) {
      advance(1);
    } else if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") advance(1);
      push("comment", start, startLine, startCol);
    } else if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      advance((end < 0 ? src.length : end + 2) - i);
      push("comment", start, startLine, startCol);
    } else if (ch === '"' || ch === "'") {
      advance(1);
      while (i < src.length && src[i] !== ch && src[i] !== "\n") advance(src[i] === "\\" ? 2 : 1);
      advance(1);
      push("string", start, startLine, startCol);
    } else if (ch === "`") {
      advance(1);
      templateRest(start, startLine, startCol);
    } else if (ch === "}" && templates.length && templates[templates.length - 1] === depth - 1) {
      // The } that closes a template's ${...}: the template goes on.
      templates.pop();
      depth--;
      advance(1);
      templateRest(start, startLine, startCol);
    } else if (ch === "/" && regexAllowed()) {
      advance(1);
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") {
          advance(2);
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        advance(1);
      }
      advance(1);
      while (i < src.length && IDENT_PART.test(src[i])) advance(1);
      push("regex", start, startLine, startCol);
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      advance(1);
      while (i < src.length && /[0-9A-Za-z_.]/.test(src[i])) advance(1);
      push("number", start, startLine, startCol);
    } else if (IDENT_START.test(ch) || (ch === "#" && IDENT_START.test(src[i + 1] ?? ""))) {
      advance(1);
      while (i < src.length && IDENT_PART.test(src[i])) advance(1);
      push("ident", start, startLine, startCol);
    } else {
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      const op = three === "..." || three === "!==" ? three : two === "?." && !/[0-9]/.test(src[i + 2] ?? "") ? two : two === "!=" ? two : ch;
      if (op === "{") depth++;
      else if (op === "}") depth = Math.max(0, depth - 1);
      advance(op.length);
      push("punct", start, startLine, startCol);
    }
  }
  return tokens;
}

/** Whether a token can end an expression, so what follows is postfix. */
function endsExpression(t: Token): boolean {
  if (t.type === "ident") return !RESERVED.has(t.value) || VALUE_KEYWORDS.has(t.value);
  if (t.type === "punct") return t.value === ")" || t.value === "]";
  return t.type === "string" || t.type === "number" || t.type === "template" || t.type === "regex";
}

/** Every place the program breaks one of `rules`, in source order. */
export function scanHonesty(src: string, rules: readonly ForbidRule[]): HonestyHit[] {
  const want = new Set(rules);
  const hits: HonestyHit[] = [];
  const all = tokenize(src);
  const code = all.filter((t) => t.type !== "comment");
  const hit = (rule: ForbidRule, t: Token) => hits.push({ rule, line: t.line, col: t.col, message: HONESTY_MESSAGES[rule] });

  if (want.has("ts-comments")) {
    for (const t of all) {
      if (t.type !== "comment") continue;
      const body = t.value.replace(/^\/[/*]+/, "").replace(/^[\s*]+/, "");
      if (/^@ts-(ignore|expect-error|nocheck)\b/.test(body)) hit("ts-comments", t);
    }
  }

  // Inside an import or export clause, `as` renames instead of asserting.
  let clause: "string" | "brace" | null = null;
  let clauseDepth = 0;
  for (let k = 0; k < code.length; k++) {
    const t = code[k];
    const prev = code[k - 1];
    const next = code[k + 1];
    const afterNext = code[k + 2];
    const member = prev?.type === "punct" && (prev.value === "." || prev.value === "?.");

    if (clause === "string" && (t.type === "string" || (t.type === "punct" && t.value === ";"))) clause = null;
    else if (clause === "brace" && t.type === "punct") {
      if (t.value === "{") clauseDepth++;
      else if (t.value === "}" && --clauseDepth === 0) clause = "string";
      else if (t.value === ";") clause = null;
    }
    if (t.type === "ident" && !member && !clause) {
      if (t.value === "import" && !(next?.type === "punct" && (next.value === "(" || next.value === "."))) {
        clause = "string";
      } else if (t.value === "export") {
        const opener = next?.type === "ident" && next.value === "type" ? afterNext : next;
        if (opener?.type === "punct" && opener.value === "*") clause = "string";
        if (opener?.type === "punct" && opener.value === "{") {
          clause = "brace";
          clauseDepth = 0;
        }
      }
    }
    if (t.type === "ident" && !member && t.value === "any" && want.has("any")) {
      // A name, not the type: { any: 1 }, (any: string) => ..., { any?: T }.
      const named = next?.type === "punct" && (next.value === ":" || (next.value === "?" && afterNext?.value === ":"));
      if (!named) hit("any", t);
    }
    if (t.type === "ident" && !member && t.value === "as" && want.has("as") && !clause && prev && endsExpression(prev)) {
      // `x as const` is allowed. `as` followed by ), ;, =, and the like is a name.
      const isConst = next?.type === "ident" && next.value === "const";
      const isName = !next || (next.type === "punct" && /^([)\]};,.=:]|\?\.)$/.test(next.value));
      if (!isConst && !isName) hit("as", t);
    }
    // Postfix ! follows an expression on the same line: x!, f()!, a[0]!.
    if (t.type === "punct" && t.value === "!" && want.has("non-null") && prev && !t.newlineBefore) {
      if ((prev.type === "ident" || prev.type === "punct") && endsExpression(prev)) hit("non-null", t);
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.col - b.col);
}
