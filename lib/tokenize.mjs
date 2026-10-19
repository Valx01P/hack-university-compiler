// The syntax highlighter's tokenizer: code in, typed pieces out (keywords,
// strings, numbers, comments, calls, escapes in strings, and directives).
// Plain JavaScript so the Node verifiers and tests can load it; the app
// reaches it through lib/highlight.tsx, which turns the pieces into `tok-*`
// spans for the code blocks, and lib/token-highlight.ts, which marks the
// editors with the same classes, so code reads the same everywhere. Escape
// sequences in strings (`\n`, `\"`, SQL's `''`) get a type of their own,
// except in raw strings, which have none.
//
// Python, JavaScript, C++, Java, Go, and SQL use the regex rules below.
// TypeScript, TSX, and JSX go through Lezer's parser (lib/lezer-tokens.mjs)
// and Bash through its own scanner (lib/bash-tokens.mjs). Directives are
// comments a tool reads (`//go:embed`, `// @ts-expect-error`, a shebang):
// they get their own type and never hide with the Code comments switch, and
// neither do TODO lines, which carry a starter's instructions.

import { bashTokens } from "./bash-tokens.mjs";
import { isLezerLanguage, lezerTokens } from "./lezer-tokens.mjs";

const JS_KW = [
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "delete", "typeof",
  "instanceof", "in", "of", "class", "extends", "super", "this", "import",
  "export", "from", "default", "try", "catch", "finally", "throw", "async",
  "await", "yield", "static", "get", "set", "null", "undefined", "true",
  "false", "void", "require",
];

const KEYWORDS = {
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
};

const ALIASES = {
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
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
};

/** A language's own id, from any of its names (`ts`, `sh`, `py`). */
export const languageId = (language) => ALIASES[language] ?? language;

const STRING_RE = `(["'\`])(?:\\\\.|(?!\\1)[^\\\\\\n])*\\1`;

// The escape sequences each language's strings (and character literals)
// understand.
const ESCAPES = {
  python: /\\(?:N\{[^}\n]*\}|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|[\\'"abfnrtv])/g,
  javascript: /\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[^\n])/g,
  cpp: /\\(?:x[0-9a-fA-F]+|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|['"?\\abfnrtv])/g,
  java: /\\(?:u+[0-9a-fA-F]{4}|[0-3][0-7]{0,2}|[4-7][0-7]?|[btnfrs'"\\])/g,
  go: /\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{3}|[abfnrtv\\'"])/g,
  // A quote doubled inside a string is one quote.
  sql: /''/g,
};

/** Whether a string, with the text just before it, is raw (no escapes):
    Python's r"", C++'s R"()", Go's backquotes, JavaScript's String.raw. */
function isRaw(text, lang, before) {
  switch (lang) {
    case "python":
      return /(?:^|[^\w])(?:[rR][bBfF]?|[bBfF][rR])$/.test(before);
    case "cpp":
      return /(?:^|[^\w])(?:u8|[uUL])?R$/.test(before);
    case "go":
      return text[0] === "`";
    case "javascript":
      return text[0] === "`" && /String\.raw\s*$/.test(before);
    default:
      return false;
  }
}

/** A string token, split around the escape sequences in it. */
function stringPieces(text, lang, before) {
  const re = ESCAPES[lang];
  if (!re || isRaw(text, lang, before)) return [{ type: "string", text }];
  const pieces = [];
  let last = 0;
  // Inside the quotes only.
  re.lastIndex = 1;
  for (let m = re.exec(text); m && m.index + m[0].length < text.length; m = re.exec(text)) {
    if (m.index > last) pieces.push({ type: "string", text: text.slice(last, m.index) });
    pieces.push({ type: "escape", text: m[0] });
    last = m.index + m[0].length;
  }
  pieces.push({ type: "string", text: text.slice(last) });
  return pieces;
}

// Python's decorators (at the start of a line, since `a @ b` multiplies
// matrices) and Java's annotations: the `@` and the name, up to any
// arguments. `@interface` declares an annotation and stays a keyword.
const DECORATORS = {
  python: { type: "fn", re: "(?<=^[ \\t]*)@[A-Za-z_][\\w.]*", flags: "m" },
  java: { type: "fn", re: "@(?!interface\\b)[A-Za-z_][\\w.]*" },
};

function rulesFor(language) {
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
  const comment = lang === "python" ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
  return [
    // A shebang on the first line (a directive, see markDirectives).
    ...(lang === "javascript" ? [{ type: "comment", re: "^#![^\\n]*" }] : []),
    { type: "comment", re: comment },
    { type: "string", re: STRING_RE },
    ...(DECORATORS[lang] ? [DECORATORS[lang]] : []),
    { type: "number", re: "\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b" },
    { type: "keyword", re: `\\b(?:${kw.join("|")})\\b` },
    { type: "fn", re: "[A-Za-z_]\\w*(?=\\s*\\()" },
  ];
}

/** The regex languages' tokens. */
function regexTokens(code, lang) {
  // Sticky regexes, tried in priority order at each position
  const rules = rulesFor(lang).map((r) => ({
    type: r.type,
    re: new RegExp(r.re, "y" + (r.flags ?? "")),
  }));
  if (!rules.length) return [{ type: null, text: code }];
  // Consume whole identifiers so keywords never match inside other words
  const ident = /[A-Za-z_]\w*/y;

  const tokens = [];
  let plain = "";
  let i = 0;

  const flushPlain = () => {
    if (plain) {
      tokens.push({ type: null, text: plain });
      plain = "";
    }
  };

  while (i < code.length) {
    let matched = null;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (m && m[0]) {
        matched = { type: rule.type, text: m[0] };
        break;
      }
    }
    if (matched) {
      // What came just before a string says whether it's raw (r"...").
      const before = plain;
      flushPlain();
      if (matched.type === "string") tokens.push(...stringPieces(matched.text, lang, before));
      else tokens.push(matched);
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

// Comments a tool reads, by language. A shebang (`#!` starting the code) is
// one in every language.
const TS_DIRECTIVES = [
  /^\/\/\/\s*<(?:reference|amd-module)\b/,
  /^\/[/*]\s*@ts-(?:expect-error|ignore|nocheck|check)\b/,
  /^\/[/*]\s*eslint-(?:disable|enable)\b/,
];
const DIRECTIVES = {
  go: [/^\/\/go:\w/, /^\/\/nolint\b/, /^\/\/\s*\+build\s/, /^\/\/\s*Code generated .* DO NOT EDIT\.$/],
  sql: [/^--\s*name:\s*\S+\s+:\w+/, /^--\s*\+goose\b/],
  python: [/^#\s*type:\s*\S/, /^#\s*noqa\b/],
  javascript: TS_DIRECTIVES,
  typescript: TS_DIRECTIVES,
  tsx: TS_DIRECTIVES,
  jsx: TS_DIRECTIVES,
  bash: [/^#\s*shellcheck\s+[a-z-]+=/],
  dockerfile: [/^#\s*(?:syntax|escape|check)\s*=/],
  http: [/^###/, /^(?:#|\/\/)\s*@name\s/],
};
// A Go example test's expected output: `// Output:` on its own line, and the
// comment lines right under it.
const GO_OUTPUT = /^\/\/\s*(?:Unordered output|Output):/;

/** The comments that are directives, typed as such. */
function markDirectives(tokens, lang) {
  const rules = DIRECTIVES[lang] ?? [];
  let pos = 0;
  let ownLine = true; // nothing but spaces so far on this line
  let blankLine = true;
  let output = false; // in a Go example's output lines
  for (const t of tokens) {
    if (t.type === "comment") {
      if ((pos === 0 && t.text.startsWith("#!")) || rules.some((re) => re.test(t.text))) t.type = "directive";
      else if (lang === "go" && ownLine && (GO_OUTPUT.test(t.text) || (output && t.text.startsWith("//")))) {
        t.type = "directive";
        output = true;
      }
      ownLine = blankLine = false;
    } else {
      t.text.split("\n").forEach((part, k) => {
        if (k > 0) {
          if (blankLine) output = false;
          ownLine = blankLine = true;
        }
        if (part.trim()) ownLine = blankLine = output = false;
      });
    }
    pos += t.text.length;
  }
  return tokens;
}

/** Tokenize source into typed segments (null type = plain text). */
export function tokenize(code, language) {
  const lang = languageId(language);
  if (lang === "bash") return markDirectives(bashTokens(code), lang);
  if (isLezerLanguage(lang)) return markDirectives(lezerTokens(code, lang), lang);
  return markDirectives(regexTokens(code, lang), lang);
}

// A TODO comment carries a starter's instructions.
const TODO = /^(?:\{?\/\*+|\/\/+|#+|--+|<!--)\s*TODO\b/;
// A JSDoc block that gives types: in JavaScript checked by TypeScript, they
// are the types.
const JSDOC_TYPES = /^\/\*\*[\s\S]*?@(?:type|param|returns?|typedef|template|property|prop|callback|satisfies|import|this|enum|overload|extends|augments|implements)\b/;
// What commentPieces calls a comment that stays.
const KEPT = "kept comment";

/** The comments hiding leaves alone: TODO comments, with the comment lines
    that go on under them at the same column, and JSDoc types in JavaScript.
    (Directives aren't comments at all.) */
function keptComments(tokens, lang) {
  const kept = new Set();
  // Where each token starts: line and column.
  let line = 0;
  let column = 0;
  const at = tokens.map((t) => {
    const here = { line, column };
    const breaks = t.text.split("\n");
    line += breaks.length - 1;
    column = breaks.length > 1 ? breaks[breaks.length - 1].length : column + t.text.length;
    return here;
  });
  tokens.forEach((t, k) => {
    if (t.type !== "comment") return;
    if (lang === "javascript" && JSDOC_TYPES.test(t.text)) kept.add(k);
    if (!TODO.test(t.text)) return;
    kept.add(k);
    let last = at[k].line + t.text.split("\n").length - 1;
    for (let j = k + 1; j < tokens.length; j++) {
      const u = tokens[j];
      if (u.type === "comment" && at[j].line === last + 1 && at[j].column === at[k].column) {
        kept.add(j);
        last = at[j].line + u.text.split("\n").length - 1;
      } else if (u.type !== null || u.text.trim() || u.text.split("\n").length > 2) break;
    }
  });
  return kept;
}

/** Whether a line of Bash (as commentPieces splits it) ends in a line
    continuation: a `\`, not one escaped by another, outside a comment. */
function continues(line) {
  const last = line[line.length - 1];
  return !!last && !["comment", KEPT, "directive"].includes(last.type) && /(?:^|[^\\])(?:\\\\)*\\$/.test(last.text);
}

/**
 * The code as pieces, marked with what hiding comments takes out: a comment
 * on a line of its own goes with that whole line, a comment after code goes
 * with the spaces before it, and one in the middle of a line goes with the
 * spaces after it. Blank lines the removed lines leave at the start, at the
 * end, or doubled up go too. In Bash, a comment line right after a line
 * continuation ends the command it continues, so only the comment goes: its
 * line stays, empty, and ends the command the same way. Without comments,
 * nothing is marked, and a block that is nothing but comments keeps them,
 * rather than going blank. Directives, TODO comments, and JavaScript's JSDoc
 * types always stay.
 */
export function commentPieces(code, language) {
  const lang = languageId(language);
  const tokens = tokenize(code, lang);
  const kept = keptComments(tokens, lang);
  const lines = [[]];
  tokens.forEach((t, k) => {
    const type = kept.has(k) ? KEPT : t.type;
    t.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type, text: part, hide: false });
    });
  });
  const blank = lines.map((l) => !l.some((p) => p.text.trim()));
  // A comment line that a Bash line continuation joins to the command above
  // isn't one: hiding it keeps the line, and the comment hides like one
  // after code.
  const commentOnly = lines.map(
    (l, k) =>
      !blank[k] && l.every((p) => !p.text.trim() || p.type === "comment") && !(lang === "bash" && k > 0 && continues(lines[k - 1]))
  );
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
  const pieces = [];
  let keptBefore = false;
  lines.forEach((line, k) => {
    if (k > 0) pieces.push({ type: null, text: "\n", hide: !(visible[k] && keptBefore) });
    pieces.push(...line.filter((p) => p.text));
    keptBefore ||= visible[k];
  });
  return pieces.map((p) => (p.type === KEPT ? { ...p, type: "comment" } : p));
}

/** The code as it reads with its comments hidden (see commentPieces). */
export function stripComments(code, language) {
  return commentPieces(code, language)
    .filter((p) => !p.hide)
    .map((p) => p.text)
    .join("");
}
