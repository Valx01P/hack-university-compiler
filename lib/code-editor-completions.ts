import { completeFromList, snippetCompletion } from "@codemirror/autocomplete";

const BASE = [
  "main", "return", "print", "input", "length", "map", "filter", "reduce",
  "sort", "split", "join", "push", "pop", "queue", "stack", "visited",
];

const WORDS: Record<string, string[]> = {
  python: ["def", "class", "self", "None", "True", "False", "range", "len", "enumerate", "zip", "list", "dict", "set", "sum", "min", "max", "import", "from", "collections", "defaultdict", "deque", "heapq", "bisect"],
  javascript: ["const", "let", "function", "return", "console", "log", "Array", "Map", "Set", "Math", "Number", "String", "Promise", "async", "await", "forEach", "reduce", "includes"],
  typescript: ["const", "let", "function", "return", "type", "interface", "enum", "Array", "Map", "Set", "Record", "Promise", "async", "await", "string", "number", "boolean", "unknown"],
  c: ["#include", "stdio.h", "stdlib.h", "string.h", "int", "long", "char", "void", "struct", "typedef", "printf", "scanf", "malloc", "free", "sizeof", "return"],
  cpp: ["#include", "bits/stdc++.h", "using", "namespace", "std", "vector", "string", "unordered_map", "unordered_set", "priority_queue", "queue", "stack", "pair", "sort", "lower_bound", "upper_bound"],
  java: ["public", "class", "static", "void", "main", "String", "System", "out", "println", "Scanner", "ArrayList", "HashMap", "HashSet", "PriorityQueue", "Arrays", "Collections", "return"],
  csharp: ["using", "System", "class", "static", "void", "Main", "Console", "WriteLine", "List", "Dictionary", "HashSet", "Queue", "Stack", "LINQ", "var", "return", "async", "await"],
  kotlin: ["fun", "main", "val", "var", "println", "readLine", "listOf", "mutableListOf", "arrayOf", "mapOf", "mutableMapOf", "setOf", "when", "data", "class", "object", "return", "null"],
  swift: ["import", "Foundation", "func", "let", "var", "print", "readLine", "Array", "Dictionary", "Set", "String", "Int", "Double", "Bool", "Optional", "guard", "switch", "return"],
  go: ["package", "main", "import", "fmt", "func", "return", "make", "map", "struct", "interface", "range", "append", "len", "cap", "nil", "true", "false"],
  rust: ["fn", "main", "let", "mut", "println!", "Vec", "String", "HashMap", "HashSet", "Option", "Result", "Some", "None", "Ok", "Err", "match", "return", "use"],
  haskell: ["main", "IO", "putStrLn", "print", "map", "filter", "foldl", "foldr", "foldl'", "Maybe", "Just", "Nothing", "Either", "Left", "Right", "where", "let", "case"],
  lua: ["local", "function", "end", "then", "elseif", "pairs", "ipairs", "table", "string", "math", "tonumber", "tostring", "print", "return", "nil", "true", "false"],
  elixir: ["defmodule", "def", "defp", "do", "end", "IO.puts", "Enum.map", "Enum.filter", "Enum.reduce", "String.split", "Map.get", "case", "cond", "with", "when", "nil", "true", "false"],
  perl: ["use", "strict", "warnings", "my", "sub", "print", "say", "chomp", "split", "join", "map", "grep", "sort", "push", "pop", "shift", "unshift", "return"],
  ruby: ["def", "end", "class", "module", "puts", "print", "each", "map", "select", "reduce", "Hash", "Array", "String", "nil", "true", "false", "return", "require"],
  php: ["<?php", "function", "echo", "print", "array", "count", "strlen", "explode", "implode", "foreach", "as", "return", "class", "public", "private", "protected", "null", "true", "false"],
  bash: ["echo", "read", "if", "then", "else", "fi", "for", "while", "do", "done", "case", "esac", "function", "local", "export", "grep", "awk", "sed"],
  sql: ["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "INSERT", "UPDATE", "DELETE", "CREATE TABLE", "COUNT", "SUM", "AVG"],
};

const SNIPPETS: Record<string, ReturnType<typeof snippetCompletion>[]> = {
  python: [
    snippetCompletion("def ${name}(${args}):\n    ${}", { label: "def", detail: "function" }),
    snippetCompletion("for ${item} in ${items}:\n    ${}", { label: "for", detail: "loop" }),
  ],
  javascript: [
    snippetCompletion("function ${name}(${args}) {\n  ${}\n}", { label: "function", detail: "snippet" }),
    snippetCompletion("for (const ${item} of ${items}) {\n  ${}\n}", { label: "for of", detail: "loop" }),
  ],
  typescript: [
    snippetCompletion("function ${name}(${args}): ${type} {\n  ${}\n}", { label: "function", detail: "typed snippet" }),
  ],
  c: [snippetCompletion("int main(void) {\n    ${}\n    return 0;\n}", { label: "main", detail: "program" })],
  cpp: [snippetCompletion("int main() {\n    ${}\n    return 0;\n}", { label: "main", detail: "program" })],
  java: [snippetCompletion("public static void main(String[] args) {\n    ${}\n}", { label: "main", detail: "method" })],
  csharp: [snippetCompletion("static void Main() {\n    ${}\n}", { label: "Main", detail: "method" })],
  kotlin: [snippetCompletion("fun main() {\n    ${}\n}", { label: "main", detail: "program" })],
  swift: [snippetCompletion("func ${name}(${args}) -> ${Type} {\n    ${}\n}", { label: "func", detail: "function" })],
  go: [snippetCompletion("func main() {\n\t${}\n}", { label: "main", detail: "program" })],
  rust: [snippetCompletion("fn main() {\n    ${}\n}", { label: "main", detail: "program" })],
  haskell: [snippetCompletion("${name} :: ${Type}\n${name} ${args} = ${}", { label: "signature", detail: "typed function" })],
  lua: [snippetCompletion("function ${name}(${args})\n  ${}\nend", { label: "function", detail: "snippet" })],
  elixir: [snippetCompletion("def ${name}(${args}) do\n  ${}\nend", { label: "def", detail: "function" })],
  perl: [snippetCompletion("sub ${name} {\n    my (${args}) = @_;\n    ${}\n}", { label: "sub", detail: "function" })],
  ruby: [snippetCompletion("def ${name}(${args})\n  ${}\nend", { label: "def", detail: "method" })],
  php: [snippetCompletion("function ${name}(${args}) {\n    ${}\n}", { label: "function", detail: "snippet" })],
  bash: [snippetCompletion("function ${name}() {\n  ${}\n}", { label: "function", detail: "snippet" })],
  sql: [snippetCompletion("SELECT ${columns}\nFROM ${table}\nWHERE ${condition};", { label: "select", detail: "query" })],
};

const ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  jsx: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  kt: "kotlin",
  kts: "kotlin",
  golang: "go",
  hs: "haskell",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  pl: "perl",
  rb: "ruby",
  ex: "elixir",
  exs: "elixir",
};

export function completionFor(language: string) {
  const lang = ALIASES[language] ?? language;
  const words = [...new Set([...BASE, ...(WORDS[lang] ?? WORDS.javascript)])];
  const keywordOptions = words.map((label) => ({ label, type: "keyword" }));
  return completeFromList([...(SNIPPETS[lang] ?? []), ...keywordOptions]);
}
