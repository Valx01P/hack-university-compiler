// Bash for the tokenizer (lib/tokenize.mjs). A `#` starts a comment only at
// the start of a word, as Bash reads it: not in `a#b`, `$#`, `${#name}`,
// `${path##*/}`, `$((16#ff))`, `"#"`, or a URL's `/#section`. Heredoc bodies
// are data, colored as strings. Escapes follow Bash's quoting: none in
// single quotes, \$ \` \" \\ and a line continuation in double quotes (and
// \$ \` \\ in unquoted heredocs), and C's in $'...'. Keywords and builtins
// are colored where a command starts, so `npm test` and `echo done` don't
// color their arguments, and `in` after `for name` or `case word`.

// Words that start or shape a command, and the builtins the course uses.
const KEYWORDS = new Set([
  "if", "then", "elif", "else", "fi", "for", "while", "until", "do", "done", "case", "esac",
  "function", "select", "time", "coproc",
  "echo", "printf", "read", "exit", "return", "local", "export", "declare", "typeset", "readonly",
  "unset", "shift", "set", "source", "cd", "pwd", "pushd", "popd", "break", "continue", "trap",
  "eval", "exec", "let", "test", "true", "false", "getopts", "mapfile", "readarray", "wait",
  "shopt", "alias", "unalias", "type", "command", "builtin", "kill", "umask", "ulimit", "jobs",
  "fg", "bg", "disown", "hash",
]);

// After these, the next word is a command again (`if grep`, `then echo`).
const LEADS = new Set(["if", "then", "elif", "else", "do", "while", "until", "time", "coproc", "!", "{", "command", "builtin", "exec"]);

// A run of ordinary word characters (up to a quote, an expansion, an escape,
// or one of Bash's metacharacters, which end a word).
const PLAIN = /[^ \t\n;&|()<>'"`$\\]+/y;
const ASSIGNMENT = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/;
const NAME = /^[A-Za-z_][\w.:-]*$/;
const NUMBER = /^\d+(?:\.\d+)?$/;
// `$name`, `$1`, `$#`, `$?`, `$@`, `$*`, `$$`, `$!`, `$-`.
const VARIABLE = /\$(?:[A-Za-z_]\w*|[0-9#?@*$!-])/y;
// In $'...': \a \b \e \E \f \n \r \t \v \\ \' \" \?, octal, hex, Unicode, and \cX.
const ANSI_ESCAPE = /\\(?:[abeEfnrtv\\'"?]|[0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|c.)/y;
const ARITH_NUMBER = /(?:0[xX][0-9a-fA-F]+|\d+#[0-9A-Za-z@_]+|\d+)(?![\w#])/y;

/** Bash source as typed pieces (null type = plain text). `patterns`, if
    given, gets the offset of each `)` that ends a case pattern, which has no
    `(` to pair with (the editor's bracket colors leave those alone). */
export function bashTokens(code, patterns = null) {
  const out = [];
  let pos = 0;
  // Heredocs whose bodies start at the next line: [{ delim, strip, quoted }]
  const heredocs = [];

  // Inside double quotes (`flat` > 0) everything is string, except escapes
  // and the comments of a `$(...)` in them.
  const emit = (type, to, flat) => {
    if (to <= pos) return;
    const t = flat && type !== "escape" && type !== "comment" ? "string" : type;
    out.push({ type: t, text: code.slice(pos, to) });
    pos = to;
  };
  const at = (s) => code.startsWith(s, pos);

  /** Code, up to the `)` that closes a `$(` (`closer`), or to the end. */
  function scanCode(closer, flat) {
    let command = true; // the next word starts a command
    let inWord = false;
    let word = { from: 0, token: 0, simple: true };
    let expect = null; // "name" after for and select, "in", "subject" after case, "function"
    let arithFor = false; // `for ((` reads arithmetic
    const parens = []; // "group", or "array" with the command state to restore
    let cases = 0;
    let redirect = null; // the command state to restore after a redirection's target

    const startWord = () => {
      if (inWord) return;
      inWord = true;
      word = { from: pos, token: out.length, simple: true };
    };
    const endWord = () => {
      if (!inWord) return;
      inWord = false;
      const text = code.slice(word.from, pos);
      arithFor = false;
      const simple = word.simple && out.length === word.token + 1 && !flat;
      const set = (type) => {
        if (simple) out[word.token].type = type;
      };
      if (redirect !== null) {
        if (simple && NUMBER.test(text)) set("number");
        command = redirect;
        redirect = null;
        return;
      }
      if (expect === "function") {
        set("fn");
        expect = null;
        command = false;
        return;
      }
      if (expect === "in" && simple && text === "in") {
        set("keyword");
        expect = null;
        command = false;
        return;
      }
      if (expect === "name" || expect === "subject") {
        expect = "in";
        command = false;
        return;
      }
      if (expect === "in") expect = null;
      if (command && ASSIGNMENT.test(text)) return; // `x=1 cmd`: still a command
      if (command && simple && KEYWORDS.has(text)) {
        set("keyword");
        if (text === "for" || text === "select") expect = "name";
        else if (text === "case") (expect = "subject"), cases++;
        else if (text === "function") expect = "function";
        else if (text === "esac") cases = Math.max(0, cases - 1);
        command = LEADS.has(text);
        arithFor = text === "for";
        return;
      }
      if (command && simple && NAME.test(text) && /[ \t]*\([ \t]*\)/y.exec(code.slice(pos, pos + 64))) {
        set("fn");
      } else if (simple && NUMBER.test(text)) {
        set("number");
      }
      command = LEADS.has(text) && simple;
    };

    while (pos < code.length) {
      const c = code[pos];
      if (c === "\n") {
        endWord();
        emit(null, pos + 1, flat);
        if (heredocs.length) scanHeredocs(flat);
        command = true;
        redirect = null;
        if (expect !== "in" && expect !== "function") expect = null;
        continue;
      }
      if (c === " " || c === "\t") {
        endWord();
        const ws = /[ \t]+/y;
        ws.lastIndex = pos;
        ws.exec(code);
        emit(null, ws.lastIndex, flat);
        continue;
      }
      if (c === "#" && !inWord) {
        const end = code.indexOf("\n", pos);
        emit("comment", end < 0 ? code.length : end, flat);
        continue;
      }
      if (c === ";" || c === "&" || c === "|") {
        endWord();
        const op = /;;&|;;|;&|&&|\|\||\|&|&>>|&>|[;&|]/y;
        op.lastIndex = pos;
        const m = op.exec(code)[0];
        emit(null, pos + m.length, flat);
        if (m.startsWith("&>")) {
          redirect = redirect ?? command;
          command = false;
        } else {
          command = true;
          redirect = null;
          if (m.startsWith(";")) expect = null;
        }
        continue;
      }
      if (c === "(") {
        // `arr=(a b c)`: the words inside are values.
        const array = inWord && code[pos - 1] === "=";
        endWord();
        if (!array && code[pos + 1] === "(" && (command || arithFor)) {
          emit(null, pos + 2, flat);
          scanArith("))", flat);
          command = false;
          arithFor = false;
          expect = null;
          continue;
        }
        emit(null, pos + 1, flat);
        parens.push(array ? { kind: "array", command } : { kind: "group" });
        command = !array;
        continue;
      }
      if (c === ")") {
        endWord();
        if (parens.length) {
          const p = parens.pop();
          command = p.kind === "array" ? p.command : true;
          emit(null, pos + 1, flat);
          continue;
        }
        if (closer === ")" && !cases) {
          emit(null, pos + 1, flat);
          return;
        }
        // A case pattern's `)`.
        patterns?.push(pos);
        emit(null, pos + 1, flat);
        command = true;
        continue;
      }
      if (c === "<" || c === ">") {
        endWord();
        if (at("<<") && !at("<<<")) {
          scanHeredocStart(flat);
          continue;
        }
        const op = /<<<|<>|<&|>>|>&|>\||[<>]/y;
        op.lastIndex = pos;
        const m = op.exec(code)[0];
        emit(null, pos + m.length, flat);
        // `<(cmd)` and `>(cmd)` are commands; anything else is a target.
        if (code[pos] !== "(") {
          redirect = redirect ?? command;
          command = false;
        }
        continue;
      }
      if (c === "\\") {
        if (code[pos + 1] === "\n") {
          // A line continuation joins the lines: the word goes on.
          emit(null, pos + 2, flat);
          if (inWord) word.simple = false;
          continue;
        }
        startWord();
        word.simple = false;
        emit(null, Math.min(pos + 2, code.length), flat);
        continue;
      }
      startWord();
      if (c === "'") {
        word.simple = false;
        scanSingle(flat);
      } else if (c === '"') {
        word.simple = false;
        scanDouble(flat);
      } else if (c === "`") {
        word.simple = false;
        scanBackquote(flat);
      } else if (c === "$") {
        word.simple = false;
        scanDollar(flat);
      } else {
        PLAIN.lastIndex = pos;
        const m = PLAIN.exec(code);
        emit(null, m ? PLAIN.lastIndex : pos + 1, flat);
      }
    }
    endWord();
  }

  /** `$name`, `${...}`, `$(...)`, `$((...))`, `$'...'`, `$"..."`. */
  function scanDollar(flat) {
    if (at("$((")) {
      emit(null, pos + 3, flat);
      scanArith("))", flat);
    } else if (at("$(")) {
      emit(null, pos + 2, flat);
      scanCode(")", flat);
    } else if (at("${")) {
      emit(null, pos + 2, flat);
      scanBraces(flat);
    } else if (at("$[")) {
      emit(null, pos + 2, flat);
      scanArith("]", flat);
    } else if (at("$'")) {
      scanAnsi(flat);
    } else if (at('$"')) {
      emit("string", pos + 1, flat);
      scanDouble(flat);
    } else {
      VARIABLE.lastIndex = pos;
      emit(null, VARIABLE.exec(code) ? VARIABLE.lastIndex : pos + 1, flat);
    }
  }

  function scanSingle(flat) {
    const end = code.indexOf("'", pos + 1);
    emit("string", end < 0 ? code.length : end + 1, flat);
  }

  /** "..." with \$ \` \" \\ and \newline as escapes, and expansions inside. */
  function scanDouble(flat) {
    emit("string", pos + 1, flat);
    while (pos < code.length) {
      const run = /[^"\\$`]+/y;
      run.lastIndex = pos;
      if (run.exec(code)) {
        emit("string", run.lastIndex, flat);
        continue;
      }
      const c = code[pos];
      if (c === '"') {
        emit("string", pos + 1, flat);
        return;
      }
      if (c === "\\") {
        if (/[$`"\\\n]/.test(code[pos + 1] ?? "")) emit("escape", pos + 2, flat);
        else emit("string", Math.min(pos + 2, code.length), flat);
      } else if (c === "`") {
        scanBackquote(flat + 1);
      } else if (at("$((")) {
        emit("string", pos + 3, flat);
        scanArith("))", flat + 1);
      } else if (at("$(")) {
        emit("string", pos + 2, flat);
        scanCode(")", flat + 1);
      } else if (at("${")) {
        emit("string", pos + 2, flat);
        scanBraces(flat + 1);
      } else {
        emit("string", pos + 1, flat);
      }
    }
  }

  /** `...` (old command substitution), colored as a string. */
  function scanBackquote(flat) {
    emit("string", pos + 1, flat);
    while (pos < code.length) {
      const run = /[^`\\]+/y;
      run.lastIndex = pos;
      if (run.exec(code)) {
        emit("string", run.lastIndex, flat);
        continue;
      }
      if (code[pos] === "`") {
        emit("string", pos + 1, flat);
        return;
      }
      emit(/[$`\\]/.test(code[pos + 1] ?? "") ? "escape" : "string", Math.min(pos + 2, code.length), flat);
    }
  }

  /** $'...' with C's escapes. */
  function scanAnsi(flat) {
    emit("string", pos + 2, flat);
    while (pos < code.length) {
      const run = /[^'\\]+/y;
      run.lastIndex = pos;
      if (run.exec(code)) {
        emit("string", run.lastIndex, flat);
        continue;
      }
      if (code[pos] === "'") {
        emit("string", pos + 1, flat);
        return;
      }
      ANSI_ESCAPE.lastIndex = pos;
      if (ANSI_ESCAPE.exec(code)) emit("escape", ANSI_ESCAPE.lastIndex, flat);
      else emit("string", Math.min(pos + 2, code.length), flat);
    }
  }

  /** ${...}: a `#` here is an operator, never a comment. */
  function scanBraces(flat) {
    let depth = 0;
    while (pos < code.length) {
      const c = code[pos];
      if (c === "}") {
        emit(null, pos + 1, flat);
        if (depth-- === 0) return;
      } else if (c === "{") {
        emit(null, pos + 1, flat);
        depth++;
      } else if (c === "'") scanSingle(flat);
      else if (c === '"') scanDouble(flat);
      else if (c === "`") scanBackquote(flat);
      else if (c === "$") scanDollar(flat);
      else if (c === "\\") emit(null, Math.min(pos + 2, code.length), flat);
      else {
        const run = /[^}{'"`$\\]+/y;
        run.lastIndex = pos;
        run.exec(code);
        emit(null, run.lastIndex, flat);
      }
    }
  }

  /** Arithmetic, up to `))` or `]`: numbers (`16#ff` too), never comments. */
  function scanArith(closer, flat) {
    let depth = 0;
    while (pos < code.length) {
      const c = code[pos];
      if (c === ")" || c === "]") {
        if (depth > 0) {
          depth--;
        } else if (closer === "))" && c === ")") {
          emit(null, code[pos + 1] === ")" ? pos + 2 : pos + 1, flat);
          return;
        } else if (closer === c) {
          emit(null, pos + 1, flat);
          return;
        }
        emit(null, pos + 1, flat);
      } else if (c === "(" || c === "[") {
        depth++;
        emit(null, pos + 1, flat);
      } else if (c === "$") scanDollar(flat);
      else if (c === "'") scanSingle(flat);
      else if (c === '"') scanDouble(flat);
      else if (c === "`") scanBackquote(flat);
      else {
        ARITH_NUMBER.lastIndex = pos;
        if (/[0-9]/.test(c) && !/[\w#]/.test(code[pos - 1] ?? "") && ARITH_NUMBER.exec(code)) {
          emit("number", ARITH_NUMBER.lastIndex, flat);
        } else {
          const run = /[A-Za-z_]\w*|[^()[\]$'"`A-Za-z_0-9]+|./y;
          run.lastIndex = pos;
          run.exec(code);
          emit(null, run.lastIndex, flat);
        }
      }
    }
  }

  /** `<<word` or `<<-word`: its body starts on the next line. */
  function scanHeredocStart(flat) {
    const op = at("<<-") ? "<<-" : "<<";
    emit(null, pos + op.length, flat);
    const ws = /[ \t]*/y;
    ws.lastIndex = pos;
    ws.exec(code);
    emit(null, ws.lastIndex, flat);
    const word = /(?:[^ \t\n;&|()<>'"\\]|\\.|'[^']*'|"[^"]*")+/y;
    word.lastIndex = pos;
    const m = word.exec(code);
    if (!m) return;
    heredocs.push({
      delim: m[0].replace(/\\(.)|['"]/g, "$1"),
      strip: op === "<<-",
      quoted: /['"\\]/.test(m[0]),
    });
    emit("string", word.lastIndex, flat);
  }

  /** The pending heredocs' bodies, from the start of a line: data, up to
      the line holding just the word (after tabs, for `<<-`). */
  function scanHeredocs(flat) {
    while (heredocs.length) {
      const { delim, strip, quoted } = heredocs.shift();
      for (;;) {
        if (pos >= code.length) return;
        const eol = code.indexOf("\n", pos);
        const end = eol < 0 ? code.length : eol;
        const line = code.slice(pos, end);
        const tabs = strip ? /^\t*/.exec(line)[0].length : 0;
        if (line.slice(tabs) === delim) {
          emit(null, pos + tabs, flat);
          emit("string", end, flat);
          // Another heredoc on the same command starts after this line.
          if (heredocs.length && eol >= 0) emit(null, eol + 1, flat);
          break;
        }
        bodyLine(eol < 0 ? code.length : eol + 1, quoted, flat);
      }
    }
  }

  /** One line of a heredoc's body, up to `to`. */
  function bodyLine(to, quoted, flat) {
    while (pos < to) {
      const slash = quoted ? -1 : code.slice(pos, to).indexOf("\\");
      if (slash < 0) {
        emit("string", to, flat);
        return;
      }
      emit("string", pos + slash, flat);
      if (/[$`\\\n]/.test(code[pos + 1] ?? "")) emit("escape", pos + 2, flat);
      else emit("string", pos + 1, flat);
    }
  }

  scanCode(null, 0);
  // Join neighbors of the same type, except escapes, which stay one apiece.
  const tokens = [];
  for (const t of out) {
    const last = tokens[tokens.length - 1];
    if (last && last.type === t.type && t.type !== "escape") last.text += t.text;
    else tokens.push({ ...t });
  }
  return tokens;
}
