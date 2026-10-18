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

/** Highlight source to React spans (server- and client-safe). */
export function Highlight({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <>
      {tokenize(code, language).map((token, i) =>
        token.type ? (
          <span key={i} className={`tok-${token.type}`}>
            {token.text}
          </span>
        ) : (
          token.text
        )
      )}
    </>
  );
}
