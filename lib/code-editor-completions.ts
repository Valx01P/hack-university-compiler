import { completeFromList, snippetCompletion } from "@codemirror/autocomplete";

const BASE = [
  "main", "return", "print", "input", "length", "map", "filter", "reduce",
  "sort", "split", "join", "push", "pop", "queue", "stack", "visited",
];

const WORDS: Record<string, string[]> = {
  python: ["def", "class", "self", "None", "True", "False", "range", "len", "enumerate", "zip", "list", "dict", "set", "sum", "min", "max", "import", "from", "collections", "defaultdict", "deque", "heapq", "bisect"],
  javascript: ["const", "let", "function", "return", "console", "log", "Array", "Map", "Set", "Math", "Number", "String", "Promise", "async", "await", "forEach", "reduce", "includes"],
  cpp: ["#include", "bits/stdc++.h", "using", "namespace", "std", "vector", "string", "unordered_map", "unordered_set", "priority_queue", "queue", "stack", "pair", "sort", "lower_bound", "upper_bound"],
  java: ["public", "class", "static", "void", "main", "String", "System", "out", "println", "Scanner", "ArrayList", "HashMap", "HashSet", "PriorityQueue", "Arrays", "Collections", "return"],
  go: ["package", "main", "import", "fmt", "func", "return", "make", "map", "struct", "interface", "range", "append", "len", "cap", "nil", "true", "false"],
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
  cpp: [snippetCompletion("int main() {\n    ${}\n    return 0;\n}", { label: "main", detail: "program" })],
  java: [snippetCompletion("public static void main(String[] args) {\n    ${}\n}", { label: "main", detail: "method" })],
  go: [snippetCompletion("func main() {\n\t${}\n}", { label: "main", detail: "program" })],
};

export function completionFor(language: string) {
  const words = [...new Set([...BASE, ...(WORDS[language] ?? WORDS.javascript)])];
  const keywordOptions = words.map((label) => ({ label, type: "keyword" }));
  return completeFromList([...(SNIPPETS[language] ?? []), ...keywordOptions]);
}
