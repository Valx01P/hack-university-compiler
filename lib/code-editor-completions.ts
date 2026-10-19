import {
  completeAnyWord,
  completeFromList,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { globalCompletion, localCompletionSource } from "@codemirror/lang-python";

/**
 * Completions on top of what each CodeMirror language already offers (its
 * keywords, snippets, and local names for Python, JavaScript, and Go):
 *
 * - module names on import lines, from the standard library plus the data
 *   structures libraries installed in the sandbox,
 * - the members people reach for after `from collections import ` or
 *   `heapq.` in Python,
 * - the names and snippets the languages without their own completion (C++
 *   and Java) need, plus any word already in the file,
 * - nothing for SQL, whose language completes keywords and the sample
 *   database's tables and columns itself (see SQL_SCHEMA).
 */

// Module names offered on import lines.
const MODULES: Record<string, string[]> = {
  python: [
    "math", "random", "collections", "itertools", "functools", "heapq", "bisect", "re", "string", "sys", "os",
    "json", "datetime", "time", "statistics", "typing", "dataclasses", "decimal", "fractions", "operator", "copy",
    "enum", "array", "queue", "textwrap", "unittest", "sortedcontainers", "numpy", "pandas", "scipy", "sympy",
  ],
  javascript: [
    "fs", "readline", "path", "util", "assert", "events", "crypto", "os", "url", "zlib", "perf_hooks",
    "node:fs", "node:readline", "node:assert",
    "@datastructures-js/priority-queue", "@datastructures-js/queue", "@datastructures-js/deque",
  ],
  cpp: [
    "bits/stdc++.h", "iostream", "vector", "string", "algorithm", "map", "set", "unordered_map", "unordered_set",
    "queue", "stack", "deque", "list", "numeric", "cmath", "climits", "utility", "tuple", "sstream", "iomanip",
    "functional", "bitset", "array", "optional", "variant", "string_view", "memory", "iterator",
    "ext/pb_ds/assoc_container.hpp", "ext/pb_ds/tree_policy.hpp",
  ],
  java: [
    "java.util.*", "java.util.Scanner", "java.util.List", "java.util.ArrayList", "java.util.LinkedList",
    "java.util.Map", "java.util.HashMap", "java.util.TreeMap", "java.util.Set", "java.util.HashSet",
    "java.util.TreeSet", "java.util.Deque", "java.util.ArrayDeque", "java.util.Queue", "java.util.PriorityQueue",
    "java.util.Arrays", "java.util.Collections", "java.util.stream.*", "java.util.stream.Collectors",
    "java.util.function.*", "java.io.*", "java.io.BufferedReader", "java.io.InputStreamReader",
    "java.math.BigInteger", "java.math.BigDecimal", "java.time.*",
  ],
  go: [
    "fmt", "strings", "sort", "strconv", "math", "os", "bufio", "errors", "unicode", "bytes", "time", "regexp",
    "container/heap", "container/list", "container/ring", "math/big",
  ],
};

// The names Python learners import most, by module, for `from x import `
// and `x.`.
const PY_MEMBERS: Record<string, string[]> = {
  collections: ["Counter", "defaultdict", "deque", "OrderedDict", "namedtuple"],
  heapq: ["heappush", "heappop", "heapify", "heappushpop", "heapreplace", "nlargest", "nsmallest"],
  bisect: ["bisect_left", "bisect_right", "bisect", "insort", "insort_left", "insort_right"],
  itertools: ["permutations", "combinations", "combinations_with_replacement", "product", "accumulate", "chain", "groupby", "count", "cycle", "islice", "pairwise", "zip_longest"],
  functools: ["lru_cache", "cache", "reduce", "cmp_to_key", "partial", "wraps"],
  math: ["sqrt", "isqrt", "inf", "pi", "gcd", "lcm", "floor", "ceil", "comb", "perm", "factorial", "log", "log2", "log10", "prod", "dist", "hypot"],
  typing: ["List", "Dict", "Set", "Tuple", "Optional", "Union", "Any", "Callable", "Iterable", "Iterator", "Deque"],
  dataclasses: ["dataclass", "field"],
  sortedcontainers: ["SortedList", "SortedDict", "SortedSet"],
  random: ["randint", "choice", "shuffle", "sample", "random", "seed", "randrange"],
  string: ["ascii_lowercase", "ascii_uppercase", "ascii_letters", "digits", "punctuation"],
  sys: ["stdin", "stdout", "setrecursionlimit", "maxsize", "argv"],
};

// Words for languages without CodeMirror completion of their own, and a few
// runtime globals the others don't know about.
const WORDS: Record<string, string[]> = {
  javascript: [
    "console", "require", "module", "exports", "process", "MinPriorityQueue", "MaxPriorityQueue", "PriorityQueue",
    "Queue", "Deque", "structuredClone",
  ],
  cpp: [
    "#include", "using", "namespace", "std", "int", "long", "double", "bool", "char", "auto", "const", "return",
    "vector", "string", "map", "set", "multiset", "unordered_map", "unordered_set", "pair", "tuple", "queue",
    "stack", "deque", "priority_queue", "greater", "less", "sort", "reverse", "lower_bound", "upper_bound",
    "accumulate", "max_element", "min_element", "make_pair", "emplace_back", "push_back", "pop_back",
    "cout", "cin", "endl", "getline", "to_string", "stoi", "INT_MAX", "INT_MIN", "LLONG_MAX", "nullptr",
  ],
  java: [
    "public", "private", "protected", "class", "interface", "static", "final", "void", "int", "long", "double",
    "boolean", "char", "String", "return", "new", "this", "null", "true", "false", "extends", "implements",
    "System", "out", "println", "printf", "Scanner", "List", "ArrayList", "LinkedList", "Map", "HashMap", "TreeMap",
    "Set", "HashSet", "TreeSet", "Deque", "ArrayDeque", "Queue", "PriorityQueue", "Arrays", "Collections",
    "Integer", "Long", "Character", "StringBuilder", "Math", "Comparator", "Collectors", "BigInteger",
  ],
  go: ["make", "append", "len", "cap", "copy", "delete", "panic", "nil", "iota", "Println", "Printf", "Sprintf"],
};

const SNIPPETS: Record<string, Completion[]> = {
  cpp: [
    snippetCompletion("int main() {\n\t${}\n\treturn 0;\n}", { label: "main", detail: "program" }),
    snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "for", detail: "loop" }),
    snippetCompletion("for (auto& ${x} : ${xs}) {\n\t${}\n}", { label: "for each", detail: "loop" }),
  ],
  java: [
    snippetCompletion("public static void main(String[] args) {\n\t${}\n}", { label: "main", detail: "method" }),
    snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "for", detail: "loop" }),
    snippetCompletion("for (${int} ${x} : ${xs}) {\n\t${}\n}", { label: "for each", detail: "loop" }),
  ],
  go: [snippetCompletion("func main() {\n\t${}\n}", { label: "main", detail: "program" })],
  sql: [
    snippetCompletion("SELECT ${columns}\nFROM ${table}\nWHERE ${condition};", { label: "select", detail: "query" }),
    snippetCompletion("CREATE TABLE ${name} (\n\tid integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n\t${}\n);", { label: "create table", detail: "table" }),
  ],
};

/** The playground's sample tables and columns (lib/sql/sample-db.ts), for
    the SQL language's table and column completion. */
export const SQL_SCHEMA: Record<string, string[]> = {
  departments: ["id", "name", "budget"],
  employees: ["id", "name", "email", "department_id", "manager_id", "salary", "hired_on"],
  customers: ["id", "name", "city", "signed_up"],
  products: ["id", "name", "category", "price", "stock"],
  orders: ["id", "customer_id", "ordered_on", "status"],
  order_items: ["order_id", "product_id", "quantity"],
};

const asOptions = (labels: string[], type: string, boost?: number): Completion[] => labels.map((label) => ({ label, type, boost }));

/** Module names on an import line (and Python members after an import or a
    module name), or null when the cursor isn't on one. */
function importSource(language: string): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const text = line.text.slice(0, ctx.pos - line.from);
    // Ranked above whatever else matches, like names the import itself
    // defines.
    const result = (typed: string, labels: string[], type = "namespace"): CompletionResult => ({
      from: ctx.pos - typed.length,
      options: asOptions(labels, type, 50),
      validFor: /^[\w./@:+*-]*$/,
    });
    let m: RegExpExecArray | null;
    switch (language) {
      case "python":
        if ((m = /^\s*from\s+(\w+)\s+import\s+(?:[\w\s,]*,\s*)?(\w*)$/.exec(text)) && PY_MEMBERS[m[1]]) {
          return result(m[2], PY_MEMBERS[m[1]], "function");
        }
        if ((m = /^\s*(?:import|from)\s+([\w.]*)$/.exec(text))) return result(m[1], MODULES.python);
        if ((m = /\b(\w+)\.(\w*)$/.exec(text)) && PY_MEMBERS[m[1]]) return result(m[2], PY_MEMBERS[m[1]], "function");
        return null;
      case "javascript":
        return (m = /(?:require\(\s*|from\s+|import\s+)["']([^"']*)$/.exec(text)) ? result(m[1], MODULES.javascript) : null;
      case "cpp":
        return (m = /^\s*#\s*include\s*<([^>]*)$/.exec(text)) ? result(m[1], MODULES.cpp) : null;
      case "java":
        return (m = /^\s*import\s+(?:static\s+)?([\w.*]*)$/.exec(text)) ? result(m[1], MODULES.java) : null;
      case "go": {
        if (!(m = /^\s*(?:import\s+)?(?:\w+\s+)?"([^"]*)$/.exec(text))) return null;
        // A bare "path only counts inside an import ( … ) block.
        const before = ctx.state.doc.sliceString(0, line.from);
        if (!/^\s*import\s/.test(text) && !/import\s*\(\s*(?:(?:\w+\s+)?"[^"]*"\s*)*$/.test(before)) return null;
        return result(m[1], MODULES.go);
      }
      default:
        return null;
    }
  };
}

/**
 * The completion sources for a language. On an import line (or after a
 * Python module name) only the import list answers, so it isn't buried in
 * other words. `override` means these replace the language's own sources:
 * Python's are included here, wrapped the same way, because its local
 * completion would offer the half-typed module name on an import line.
 */
export function completionSources(language: string): { sources: CompletionSource[]; override: boolean } {
  const imports = importSource(language);
  const general: CompletionSource[] = [];
  const extra = [...(SNIPPETS[language] ?? []), ...asOptions(WORDS[language] ?? [], "keyword")];
  if (extra.length) general.push(completeFromList(extra));
  // C++ and Java have no local-name completion of their own.
  if (language === "cpp" || language === "java") general.push(completeAnyWord);
  if (language === "python") general.push(localCompletionSource, globalCompletion);
  const unlessImporting =
    (source: CompletionSource): CompletionSource =>
    (ctx) =>
      imports(ctx) ? null : source(ctx);
  return { sources: [imports, ...general.map(unlessImporting)], override: language === "python" };
}
