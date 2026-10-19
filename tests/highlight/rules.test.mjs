// The tokenizer's rules, one case at a time (the snapshots show whole
// samples): what Bash calls a comment, directives and TODO lines that never
// hide, escapes and raw strings, decorators, and TypeScript through Lezer.
// The Bash comment cases were checked against bash 5.3 itself, whose
// `declare -f` prints a function without its comments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { languageId, stripComments, tokenize } from "../../lib/tokenize.mjs";

/** The texts of the tokens of one type. */
const of = (type, code, language) => tokenize(code, language).filter((t) => t.type === type).map((t) => t.text);

test("bash: a # starts a comment only at the start of a word", () => {
  const cases = [
    ["echo a#b c#d # note", ["# note"]],
    ["echo ${#name} $# ${path#*/} ${path##*/} # note", ["# note"]],
    ["echo '#' \"#\" $'#' \\#x # note", ["# note"]],
    ["echo https://example.com/#top # note", ["# note"]],
    ["echo $(( 16#ff )) $((2#101)) # note", ["# note"]],
    ["(( mask = 16#f0 )) # note", ["# note"]],
    ["echo {#,a} a=#b # note", ["# note"]],
    ["echo x;# note", ["# note"]],
    ["echo x|# note\ncat", ["# note"]],
    ["echo x &# note", ["# note"]],
    ["arr=(a b # note\n  c)", ["# note"]],
    ["x=$(echo hi # note\n)", ["# note"]],
    ["x=\"$(echo hi # note\n)\"", ["# note"]],
    ["echo a\\\n#b # note", ["# note"]],
    ["echo `echo # in backquotes` # note", ["# note"]],
    ["echo $(case a in a) echo ok;; esac) # note", ["# note"]],
    ["x='a\n# still the string' # note", ["# note"]],
  ];
  for (const [code, comments] of cases) assert.deepEqual(of("comment", code, "bash"), comments, code);
});

test("bash: heredoc bodies are data", () => {
  const code = "cat <<EOF # note\n# not a comment\nEOF\necho done";
  assert.deepEqual(of("comment", code, "bash"), ["# note"]);
  assert.equal(stripComments(code, "bash"), "cat <<EOF\n# not a comment\nEOF\necho done");
  // <<- strips tabs, so its closing word may be indented with them.
  assert.deepEqual(of("comment", "cat <<-END\n\t# data\n\tEND\n# note", "bash"), ["# note"]);
  // Two heredocs on one line, read in order.
  assert.deepEqual(of("comment", "paste <<A <<B\n# a\nA\n# b\nB\n# note", "bash"), ["# note"]);
});

test("bash: escapes follow its quoting", () => {
  assert.deepEqual(of("escape", "echo 'a\\nb\\$'", "bash"), []);
  assert.deepEqual(of("escape", 'echo "\\$x \\` \\" \\\\ \\n \\t"', "bash"), ["\\$", "\\`", '\\"', "\\\\"]);
  assert.deepEqual(of("escape", 'echo "a\\\nb"', "bash"), ["\\\n"]);
  assert.deepEqual(of("escape", "echo $'\\t\\n\\x41\\u00e9\\101\\e\\cA\\q'", "bash"), ["\\t", "\\n", "\\x41", "\\u00e9", "\\101", "\\e", "\\cA"]);
  assert.deepEqual(of("escape", "cat <<EOF\n\\$HOME \\` \\\\ \\n\nEOF", "bash"), ["\\$", "\\`", "\\\\"]);
  assert.deepEqual(of("escape", "cat <<'EOF'\n\\$HOME \\\\\nEOF", "bash"), []);
});

test("bash: keywords where a command starts, functions, numbers", () => {
  const code = "if true; then echo done in time; fi\nfor f in a b; do npm test; done\ngreet() { return 0; }\nfunction bye { exit 1; }";
  assert.deepEqual(of("keyword", code, "bash"), ["if", "true", "then", "echo", "fi", "for", "in", "do", "done", "return", "function", "exit"]);
  assert.deepEqual(of("fn", code, "bash"), ["greet", "bye"]);
  assert.deepEqual(of("number", code, "bash"), ["0", "1"]);
  assert.deepEqual(of("number", "x=v1.2.3 2>&1 sleep 0.5", "bash"), ["2", "1", "0.5"]);
});

test("typescript: escapes, raw strings, and template literals", () => {
  assert.deepEqual(of("escape", 'const s = "a\\tb\\u00e9\\x41\\u{1F600}";', "typescript"), ["\\t", "\\u00e9", "\\x41", "\\u{1F600}"]);
  assert.deepEqual(of("escape", "const s = `a\\n${b}\\t`;", "typescript"), ["\\n", "\\t"]);
  assert.deepEqual(of("escape", "const s = String.raw`C:\\new ${b}`;", "typescript"), []);
  // `${` and `}` take the keyword color, and what's inside is code.
  const tokens = tokenize("`total: ${count + 1}`", "typescript");
  assert.deepEqual(tokens.map((t) => [t.type, t.text]), [["string", "`total: "], ["keyword", "${"], [null, "count + "], ["number", "1"], ["keyword", "}"], ["string", "`"]]);
  // A template literal type is a string too.
  assert.deepEqual(of("string", "type Path = `/${string}`;", "typescript"), ["`/", "`"]);
});

test("typescript: names, types, and calls", () => {
  const code = "const m = new Map<string, number>(); const v = useState<boolean>(false); let u: unknown = undefined; type T = Record<string, never>;";
  assert.deepEqual(of("fn", code, "typescript"), ["Map", "useState"]);
  assert.deepEqual(of("keyword", code, "typescript"), ["const", "new", "string", "number", "const", "boolean", "false", "let", "unknown", "undefined", "type", "string", "never"]);
  // A method's name is fn, like a call, in classes, interfaces, and objects.
  assert.deepEqual(of("fn", "class A { greet<T>(x: T) {} } interface B { run(): void } const o = { show() {} };", "typescript"), ["greet", "run", "show"]);
});

test("tsx: tags, attributes, and {/* comments */} that hide with their braces", () => {
  const code = 'const el = (\n  <div className="box">\n    {/* the label */}\n    <p>it\'s {n}</p>\n  </div>\n);';
  assert.deepEqual(of("keyword", code, "tsx"), ["const", "div", "p", "p", "div"]);
  assert.deepEqual(of("fn", code, "tsx"), ["className"]);
  assert.deepEqual(of("string", code, "tsx"), ['"box"']);
  assert.deepEqual(of("comment", code, "tsx"), ["{/* the label */}"]);
  assert.equal(stripComments(code, "tsx"), 'const el = (\n  <div className="box">\n    <p>it\'s {n}</p>\n  </div>\n);');
});

test("languages have their usual names", () => {
  assert.equal(languageId("ts"), "typescript");
  assert.equal(languageId("mts"), "typescript");
  assert.equal(languageId("sh"), "bash");
  assert.equal(languageId("zsh"), "bash");
  assert.equal(languageId("tsx"), "tsx");
  assert.deepEqual(tokenize("let x = 1", "ts"), tokenize("let x = 1", "typescript"));
  assert.deepEqual(tokenize("echo hi # x", "sh"), tokenize("echo hi # x", "bash"));
});
