// The tokenizer's rules for the files a workspace holds besides its code:
// JSON (with tsconfig's comments), YAML, Markdown, CSS, HTML and XML, .http
// request files, .env and .properties, TOML, Dockerfiles, and Makefiles
// (architecture §8.4 item 9). They map onto the same token types as every
// language (keywords, strings, numbers, comments, calls and names as `fn`,
// escapes), so all 18 palettes stay valid, and comments come out as
// comments, so the Code comments switch hides them like any other. HTML
// hands its <script> and <style> to the JavaScript and CSS rules.
//
// lib/tokenize.mjs calls fileTokens() for these languages.

/** Runs sticky rules, in order, at each position; text no rule matches
    is plain, a word at a time. */
function scan(code, rules) {
  const compiled = rules.map((r) => ({ type: r.type, re: new RegExp(r.re, `y${r.flags ?? ""}`), split: r.split }));
  const tokens = [];
  let plain = "";
  const word = /[A-Za-z_][\w-]*/y;
  const flush = () => {
    if (plain) tokens.push({ type: null, text: plain });
    plain = "";
  };
  for (let i = 0; i < code.length; ) {
    let hit = null;
    for (const rule of compiled) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (m && m[0]) {
        hit = { rule, text: m[0] };
        break;
      }
    }
    if (hit) {
      flush();
      if (hit.rule.split) tokens.push(...hit.rule.split(hit.text));
      else tokens.push({ type: hit.rule.type, text: hit.text });
      i += hit.text.length;
      continue;
    }
    word.lastIndex = i;
    const w = word.exec(code);
    const chunk = w && w[0] ? w[0] : code[i];
    plain += chunk;
    i += chunk.length;
  }
  flush();
  return tokens;
}

const DQ = '"(?:\\\\.|[^"\\\\\\n])*"';
const SQ = "'(?:\\\\.|[^'\\\\\\n])*'";

/** A JSON string, split around its escapes. */
function jsonString(text) {
  const pieces = [];
  let last = 0;
  const re = /\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) pieces.push({ type: "string", text: text.slice(last, m.index) });
    pieces.push({ type: "escape", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ type: "string", text: text.slice(last) });
  return pieces;
}

const RULES = {
  // JSON, and JSON with comments (tsconfig.json): keys are names, values strings.
  json: [
    { type: "comment", re: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/" },
    { type: "fn", re: `${DQ}(?=\\s*:)` },
    { type: "string", re: DQ, split: jsonString },
    { type: "number", re: "-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b" },
    { type: "keyword", re: "\\b(?:true|false|null)\\b" },
  ],
  yaml: [
    { type: "comment", re: "(?<=^|[ \\t])#[^\\n]*", flags: "m" },
    { type: "keyword", re: "^(?:---|\\.\\.\\.)(?=\\s|$)", flags: "m" },
    { type: "string", re: `${DQ}|'(?:''|[^'\\n])*'` },
    { type: "fn", re: "(?<=^[ \\t]*(?:- )*)(?!- )[^\\s#'\"{}\\[\\],&*!|>%@`][^\\n:#]*?(?=:(?:[ \\t]|$))", flags: "m" },
    { type: "keyword", re: "(?<=^[ \\t]*)- |[&*][\\w-]+|![\\w!/-]*", flags: "m" },
    { type: "number", re: "(?<![\\w.-])-?\\d+(?:\\.\\d+)?(?![\\w.-])" },
    { type: "keyword", re: "(?<![\\w-])(?:true|false|null|yes|no|on|off|~)(?![\\w-])" },
  ],
  markdown: [
    { type: "comment", re: "<!--[\\s\\S]*?-->" },
    { type: "string", re: "^(```|~~~)[^\\n]*\\n[\\s\\S]*?^\\1[ \\t]*$", flags: "m" },
    { type: "keyword", re: "^#{1,6}[ \\t][^\\n]*", flags: "m" },
    { type: "keyword", re: "^[ \\t]*(?:[-*+]|\\d+[.)])(?=[ \\t])|^[ \\t]*>", flags: "m" },
    { type: "string", re: "(`+)[^`\\n]+?\\1" },
    { type: "fn", re: "!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)" },
  ],
  http: [
    { type: "comment", re: "^###[^\\n]*|^[ \\t]*(?:#|\\/\\/)[^\\n]*", flags: "m" },
    { type: "keyword", re: "^@[\\w-]+(?=\\s*=)", flags: "m" },
    { type: "keyword", re: "^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)(?= )|HTTP\\/\\d(?:\\.\\d)?", flags: "m" },
    { type: "escape", re: "\\{\\{[^}\\n]*\\}\\}" },
    { type: "fn", re: "^[\\w-]+(?=:[ \\t])", flags: "m" },
    { type: "fn", re: `${DQ}(?=\\s*:)` },
    { type: "string", re: DQ },
    { type: "number", re: "-?\\b\\d+(?:\\.\\d+)?\\b" },
    { type: "keyword", re: "\\b(?:true|false|null)\\b" },
  ],
  env: [
    { type: "comment", re: "^[ \\t]*[#!][^\\n]*", flags: "m" },
    { type: "keyword", re: "^[ \\t]*export(?=[ \\t])", flags: "m" },
    { type: "fn", re: "(?<=^[ \\t]*(?:export[ \\t]+)?)[\\w.-]+(?=[ \\t]*[=:])", flags: "m" },
    { type: "string", re: `${DQ}|${SQ}` },
    { type: "escape", re: "\\$\\{[^}\\n]*\\}|\\$\\w+" },
  ],
  toml: [
    { type: "comment", re: "#[^\\n]*" },
    { type: "keyword", re: "^[ \\t]*\\[\\[?[^\\]\\n]*\\]\\]?", flags: "m" },
    { type: "string", re: `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|${DQ}|'[^'\\n]*'` },
    { type: "fn", re: "^[ \\t]*[\\w.\"-]+(?=[ \\t]*=)", flags: "m" },
    { type: "number", re: "\\b\\d{4}-\\d{2}-\\d{2}(?:[T ][\\d:.]+(?:Z|[+-]\\d{2}:\\d{2})?)?\\b|-?\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b" },
    { type: "keyword", re: "\\b(?:true|false|inf|nan)\\b" },
  ],
  dockerfile: [
    { type: "comment", re: "^[ \\t]*#[^\\n]*", flags: "m" },
    {
      type: "keyword",
      re: "^[ \\t]*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL|MAINTAINER)\\b|\\b(?:AS|as)\\b(?=[ \\t]+\\w)",
      flags: "mi",
    },
    { type: "string", re: `${DQ}|${SQ}` },
    { type: "escape", re: "\\$\\{[^}\\n]*\\}|\\$\\w+" },
    { type: "number", re: "\\b\\d+(?:\\.\\d+)*\\b" },
  ],
  makefile: [
    { type: "comment", re: "(?<=^|[ \\t])#[^\\n]*", flags: "m" },
    { type: "keyword", re: "^[ \\t]*(?:include|-include|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|override|\\.PHONY|\\.DEFAULT_GOAL)\\b", flags: "m" },
    { type: "fn", re: "^[\\w./%$(){}-]+(?=[ \\t]*:(?!=))", flags: "m" },
    { type: "escape", re: "\\$\\([^)\\n]*\\)|\\$\\{[^}\\n]*\\}|\\$[@<^*?%]" },
    { type: "string", re: `${DQ}|${SQ}` },
  ],
};
RULES.properties = RULES.env;

/** CSS: properties are names only inside a block, so `a:hover` stays a
    selector. Comments, strings, at-rules, numbers with units, colors,
    functions, and !important. */
function cssTokens(code) {
  const rules = [
    { type: "comment", re: "\\/\\*[\\s\\S]*?\\*\\/" },
    { type: "string", re: `${DQ}|${SQ}` },
    { type: "keyword", re: "@[\\w-]+|!important\\b" },
    { type: "fn", re: "[\\w-]+(?=\\()" },
    { type: "number", re: "#[0-9a-fA-F]{3,8}\\b|-?(?:\\d*\\.\\d+|\\d+)(?:%|[a-zA-Z]+)?" },
  ];
  const tokens = scan(code, rules);
  // Names right after `{` or `;` (inside a block) and before `:` are properties.
  let depth = 0;
  let expectProperty = false;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type) {
      expectProperty = false;
      continue;
    }
    // Plain text: walk it for braces and semicolons, splitting out property names.
    const out = [];
    let rest = t.text;
    while (rest) {
      const m = /[{};]|[A-Za-z_-][\w-]*/.exec(rest);
      if (!m) {
        out.push({ type: null, text: rest });
        break;
      }
      if (m.index) out.push({ type: null, text: rest.slice(0, m.index) });
      const piece = m[0];
      rest = rest.slice(m.index + piece.length);
      if (piece === "{") {
        depth++;
        expectProperty = true;
      } else if (piece === "}") {
        depth = Math.max(0, depth - 1);
        expectProperty = depth > 0;
      } else if (piece === ";") expectProperty = depth > 0;
      else if (expectProperty && depth > 0 && /^\s*:/.test(rest + (tokens[k + 1]?.text ?? ""))) {
        out.push({ type: "fn", text: piece });
        expectProperty = false;
        continue;
      } else if (/\S/.test(piece)) expectProperty = false;
      out.push({ type: null, text: piece });
    }
    tokens.splice(k, 1, ...out);
    k += out.length - 1;
  }
  return merge(tokens);
}

/** HTML and XML: tag names as keywords, attribute names as names, values as
    strings, entities as escapes, comments, and <script> and <style> by the
    JavaScript and CSS rules. */
function markupTokens(code, inner) {
  const tokens = [];
  const push = (type, text) => text && tokens.push({ type, text });
  let i = 0;
  while (i < code.length) {
    if (code.startsWith("<!--", i)) {
      const end = code.indexOf("-->", i + 4);
      const stop = end < 0 ? code.length : end + 3;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (/^<![A-Za-z]/.test(code.slice(i, i + 3)) || code.startsWith("<?", i)) {
      const end = code.indexOf(">", i);
      const stop = end < 0 ? code.length : end + 1;
      push("keyword", code.slice(i, stop));
      i = stop;
      continue;
    }
    const open = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(code.slice(i, i + 80));
    if (open) {
      push(null, `<${open[1]}`);
      push("keyword", open[2]);
      i += open[0].length;
      // Attributes until the tag ends.
      const attr = /\s+|[^\s=>"'/]+(?=\s*=)|[^\s=>"'/]+|=|"[^"]*"|'[^']*'|\/(?=>)|>/y;
      let closed = false;
      // A value after = is a string, quoted or not.
      let value = false;
      while (i < code.length && !closed) {
        attr.lastIndex = i;
        const m = attr.exec(code);
        if (!m) {
          push(null, code[i]);
          i++;
          continue;
        }
        const text = m[0];
        if (text === ">") closed = true;
        const blank = /^\s|^=$|^\/$|^>$/.test(text);
        push(/^["']/.test(text) || (value && !blank) ? "string" : blank ? null : "fn", text);
        if (text === "=") value = true;
        else if (!/^\s/.test(text)) value = false;
        i += text.length;
      }
      const name = open[2].toLowerCase();
      if (!open[1] && closed && (name === "script" || name === "style")) {
        const end = code.toLowerCase().indexOf(`</${name}`, i);
        const stop = end < 0 ? code.length : end;
        tokens.push(...inner(code.slice(i, stop), name === "script" ? "javascript" : "css"));
        i = stop;
      }
      continue;
    }
    const entity = /^&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z]\w*);/.exec(code.slice(i, i + 40));
    if (entity) {
      push("escape", entity[0]);
      i += entity[0].length;
      continue;
    }
    const text = /^[^<&]+/.exec(code.slice(i));
    const chunk = text ? text[0] : code[i];
    push(null, chunk);
    i += chunk.length;
  }
  return merge(tokens);
}

/** Neighbors of one type become one token. */
function merge(tokens) {
  const out = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.type === t.type && t.type !== "escape") last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

export const FILE_LANGUAGES = new Set([...Object.keys(RULES), "css", "html", "xml"]);

/** A file language's tokens (null type = plain text). `inner` tokenizes
    embedded code (HTML's scripts and styles). */
export function fileTokens(code, language, inner) {
  if (language === "css") return cssTokens(code);
  if (language === "html" || language === "xml") return markupTokens(code, inner);
  return scan(code, RULES[language]);
}
