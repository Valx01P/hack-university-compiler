/**
 * Tiny dependency-free syntax highlighter for the lesson code blocks.
 * Produces spans with `tok-*` classes; colors are the editor's `--hl-*`
 * variables, so blocks follow the code theme and contrast level. Fences in an
 * unknown language (or `text`, used for expected output) render plain.
 */

const JS_KW = [
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "delete", "typeof",
  "instanceof", "in", "of", "class", "extends", "super", "this", "import",
  "export", "from", "default", "try", "catch", "finally", "throw", "async",
  "await", "yield", "static", "get", "set", "null", "undefined", "true",
  "false", "void", "require",
];

const KEYWORDS: Record<string, string[]> = {
  javascript: JS_KW,
  python: [
    "def", "return", "if", "elif", "else", "for", "while", "break",
    "continue", "pass", "import", "from", "as", "class", "try", "except",
    "finally", "raise", "with", "lambda", "yield", "global", "nonlocal",
    "del", "assert", "in", "is", "not", "and", "or", "None", "True", "False",
    "print", "self", "async", "await", "match", "case",
  ],
  cpp: [
    "auto", "bool", "break", "case", "char", "class", "const", "constexpr",
    "continue", "default", "delete", "do", "double", "else", "enum", "extern",
    "false", "float", "for", "friend", "if", "inline", "int", "long",
    "namespace", "new", "nullptr", "operator", "private", "protected",
    "public", "return", "short", "signed", "sizeof", "static", "struct",
    "switch", "template", "this", "throw", "true", "try", "catch", "typedef",
    "typename", "union", "unsigned", "using", "virtual", "void", "while",
    "include", "pair", "vector", "string", "std", "size_t",
  ],
  java: [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "if", "implements", "import",
    "instanceof", "int", "interface", "long", "native", "new", "package",
    "private", "protected", "public", "return", "short", "static", "super",
    "switch", "synchronized", "this", "throw", "throws", "transient", "try",
    "void", "volatile", "while", "var", "yield", "true", "false", "null",
    "String", "System",
  ],
  go: [
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
    "map", "package", "range", "return", "select", "struct", "switch", "type",
    "var", "nil", "true", "false", "iota", "make", "new", "len", "cap",
    "append", "string", "int", "int64", "bool", "error", "byte", "rune", "float64",
  ],
  sql: [
    "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "NULL", "IS", "IN", "BETWEEN", "LIKE", "ILIKE",
    "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "DISTINCT", "AS", "ASC", "DESC", "NULLS",
    "FIRST", "LAST", "CASE", "WHEN", "THEN", "ELSE", "END", "JOIN", "INNER", "LEFT", "RIGHT", "FULL",
    "OUTER", "CROSS", "ON", "USING", "UNION", "ALL", "INTERSECT", "EXCEPT", "WITH", "RECURSIVE", "OVER",
    "PARTITION", "WINDOW", "ROWS", "RANGE", "PRECEDING", "FOLLOWING", "CURRENT", "ROW", "UNBOUNDED",
    "EXISTS", "ANY", "SOME", "INSERT", "INTO", "VALUES", "RETURNING", "UPDATE", "SET", "DELETE",
    "CONFLICT", "DO", "NOTHING", "CREATE", "TABLE", "VIEW", "INDEX", "PRIMARY", "KEY", "FOREIGN",
    "REFERENCES", "UNIQUE", "CHECK", "DEFAULT", "CONSTRAINT", "ALTER", "ADD", "COLUMN", "DROP",
    "RENAME", "TO", "TRUNCATE", "CASCADE", "IF", "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT",
    "TRUE", "FALSE", "CAST", "INTEGER", "INT", "BIGINT", "SMALLINT", "SERIAL", "NUMERIC", "DECIMAL",
    "REAL", "TEXT", "VARCHAR", "CHAR", "BOOLEAN", "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ",
    "INTERVAL", "JSON", "JSONB", "FUNCTION", "RETURNS", "LANGUAGE", "EXPLAIN", "ANALYZE", "FILTER",
  ],
  bash: [
    "if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while",
    "until", "case", "esac", "function", "return", "local", "export",
    "echo", "read", "exit", "true", "false",
  ],
};

interface Rule {
  type: string;
  re: string;
  /** Extra regex flags, like "i" for SQL's case-insensitive keywords. */
  flags?: string;
}

const ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  node: "javascript",
  "c++": "cpp",
  golang: "go",
  postgres: "sql",
  postgresql: "sql",
  psql: "sql",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
};

const STRING_RE = `(["'\`])(?:\\\\.|(?!\\1)[^\\\\\\n])*\\1`;

function rulesFor(language: string): Rule[] {
  const lang = ALIASES[language] ?? language;
  const kw = KEYWORDS[lang];
  if (!kw) return [];
  if (lang === "sql") {
    return [
      { type: "comment", re: "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/" },
      { type: "string", re: "'(?:''|[^'])*'" },
      { type: "number", re: "\\b\\d+(?:\\.\\d+)?\\b" },
      { type: "keyword", re: `\\b(?:${kw.join("|")})\\b`, flags: "i" },
      { type: "fn", re: "[A-Za-z_]\\w*(?=\\s*\\()" },
    ];
  }
  const comment =
    lang === "python" || lang === "bash" ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
  return [
    { type: "comment", re: comment },
    { type: "string", re: STRING_RE },
    { type: "number", re: "\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b" },
    { type: "keyword", re: `\\b(?:${kw.join("|")})\\b` },
    { type: "fn", re: "[A-Za-z_]\\w*(?=\\s*\\()" },
  ];
}

export interface Token {
  type: string | null;
  text: string;
}

/** Tokenize source into typed segments (null type = plain text). */
export function tokenize(code: string, language: string): Token[] {
  // Sticky regexes, tried in priority order at each position
  const rules = rulesFor(language).map((r) => ({
    type: r.type,
    re: new RegExp(r.re, "y" + (r.flags ?? "")),
  }));
  if (!rules.length) return [{ type: null, text: code }];
  // Consume whole identifiers so keywords never match inside other words
  const ident = /[A-Za-z_]\w*/y;

  const tokens: Token[] = [];
  let plain = "";
  let i = 0;

  const flushPlain = () => {
    if (plain) {
      tokens.push({ type: null, text: plain });
      plain = "";
    }
  };

  while (i < code.length) {
    let matched: Token | null = null;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (m && m[0]) {
        matched = { type: rule.type, text: m[0] };
        break;
      }
    }
    if (matched) {
      flushPlain();
      tokens.push(matched);
      i += matched.text.length;
      continue;
    }
    // No rule matched — consume an identifier (or one char) as plain text
    ident.lastIndex = i;
    const word = ident.exec(code);
    const chunk = word && word[0] ? word[0] : code[i];
    plain += chunk;
    i += chunk.length;
  }
  flushPlain();
  return tokens;
}

interface Piece extends Token {
  /** Part of what hiding comments removes. */
  hide: boolean;
}

/**
 * The code as pieces, marked with what hiding comments takes out: a comment
 * on a line of its own goes with that whole line, a comment after code goes
 * with the spaces before it, and one in the middle of a line goes with the
 * spaces after it. Blank lines the removed lines leave at the start, at the
 * end, or doubled up go too. Without comments, nothing is marked, and a
 * block that is nothing but comments keeps them, rather than going blank.
 */
function commentPieces(code: string, language: string): Piece[] {
  const lines: Piece[][] = [[]];
  for (const t of tokenize(code, language)) {
    t.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: t.type, text: part, hide: false });
    });
  }
  const blank = lines.map((l) => !l.some((p) => p.text.trim()));
  const commentOnly = lines.map((l, k) => !blank[k] && l.every((p) => !p.text.trim() || p.type === "comment"));
  if (lines.every((_, k) => blank[k] || commentOnly[k])) {
    return lines.flatMap((line, k) => [...(k > 0 ? [{ type: null, text: "\n", hide: false }] : []), ...line]);
  }

  // Which lines stay.
  const visible = commentOnly.map((c) => !c);
  let previous = -1;
  let hiddenSince = false;
  lines.forEach((_, k) => {
    if (commentOnly[k]) hiddenSince = true;
    else if (blank[k] && hiddenSince && (previous < 0 || blank[previous])) visible[k] = false;
    else {
      previous = k;
      hiddenSince = false;
    }
  });
  for (let k = lines.length - 1, after = false; k >= 0; k--) {
    if (commentOnly[k]) after = true;
    else if (blank[k] && after && visible[k]) visible[k] = false;
    else break;
  }

  // In the lines that stay, the comments and the spaces they leave.
  lines.forEach((line, k) => {
    if (!visible[k]) {
      line.forEach((p) => (p.hide = true));
      return;
    }
    for (let i = 0; i < line.length; i++) {
      if (line[i].type !== "comment") continue;
      line[i].hide = true;
      const trailing = line.slice(i + 1).every((p) => p.type === "comment" || !p.text.trim());
      if (trailing) {
        line.slice(i + 1).forEach((p) => (p.hide = true));
        // The spaces before it: whole pieces, then the end of the one before.
        let j = i - 1;
        for (; j >= 0 && !line[j].text.trim(); j--) line[j].hide = true;
        const ws = j >= 0 ? /\s+$/.exec(line[j].text) : null;
        if (ws && !line[j].hide) {
          line.splice(j + 1, 0, { type: line[j].type, text: ws[0], hide: true });
          line[j] = { ...line[j], text: line[j].text.slice(0, -ws[0].length) };
          i++;
        }
        break;
      }
      // In the middle of a line: the spaces after it.
      const next = line[i + 1];
      const ws = next && !next.hide ? /^\s+/.exec(next.text) : null;
      if (ws) {
        line.splice(i + 1, 0, { type: next.type, text: ws[0], hide: true });
        line[i + 2] = { ...next, text: next.text.slice(ws[0].length) };
        i++;
      }
    }
  });

  // Join the lines. A line break stays when a kept line follows it and
  // another kept line came before it.
  const pieces: Piece[] = [];
  let keptBefore = false;
  lines.forEach((line, k) => {
    if (k > 0) pieces.push({ type: null, text: "\n", hide: !(visible[k] && keptBefore) });
    pieces.push(...line.filter((p) => p.text));
    keptBefore ||= visible[k];
  });
  return pieces;
}

/** The code as it reads with its comments hidden (see commentPieces). */
export function stripComments(code: string, language: string): string {
  return commentPieces(code, language)
    .filter((p) => !p.hide)
    .map((p) => p.text)
    .join("");
}

/**
 * Highlight source to React spans (server- and client-safe). Each comment,
 * with the line or spaces it would leave behind, sits in a `.code-cmt` span,
 * so the "code comments" setting can hide it with CSS before first paint.
 */
export function Highlight({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const token = (p: Token, key: number) =>
    p.type ? (
      <span key={key} className={`tok-${p.type}`}>
        {p.text}
      </span>
    ) : (
      p.text
    );
  // Runs of pieces that hide together share one span.
  const out: React.ReactNode[] = [];
  const pieces = commentPieces(code, language);
  for (let i = 0; i < pieces.length; ) {
    if (!pieces[i].hide) {
      out.push(token(pieces[i], i));
      i++;
      continue;
    }
    const start = i;
    while (i < pieces.length && pieces[i].hide) i++;
    out.push(
      <span key={`c${start}`} className="code-cmt">
        {pieces.slice(start, i).map((p, k) => token(p, k))}
      </span>
    );
  }
  return <>{out}</>;
}
