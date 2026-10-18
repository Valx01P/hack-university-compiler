/**
 * Config for the compiler, one entry per language, each rendered as its own
 * page at /<slug>. Pure data (no server deps), safe to import from client and
 * server. The sandbox side of each language lives in lib/runtimes.json, except
 * SQL, which runs on PostgreSQL in the browser (lib/sql).
 */
export interface CompilerLang {
  slug: string;
  label: string;
  /** Display file name in the editor tab (main.cpp, Main.java…). */
  fileName: string;
  /** Default starter program shown on a fresh page. */
  starter: string;
}

/** Fired after every run so the sandbox badge re-checks (a failed run is
    often the first sign the sandbox stopped or a runtime is missing). */
export const SANDBOX_REFRESH_EVENT = "hu:sandbox-refresh";

const LABELS: Record<string, string> = {
  python: "Python 3",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
  go: "Go",
  sql: "SQL",
};

const MSG = "Start small. Ship something.";

const STARTERS: Record<string, string> = {
  python: `# Online Python compiler. Write and run Python in your browser.\nprint("${MSG}")\n`,
  javascript: `// Online JavaScript compiler. Write and run JS in your browser.\nconsole.log("${MSG}");\n`,
  cpp: `// Online C++ compiler. Write and run C++ in your browser.\n#include <iostream>\n\nint main() {\n    std::cout << "${MSG}" << std::endl;\n    return 0;\n}\n`,
  java: `// Online Java compiler. Write and run Java in your browser.\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("${MSG}");\n    }\n}\n`,
  go: `// Online Go compiler. Write and run Go in your browser.\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${MSG}")\n}\n`,
  sql: `-- PostgreSQL in your browser. The sample database has departments,\n-- employees, customers, products, orders, and order_items.\nSELECT d.name AS department, count(*) AS people, round(avg(e.salary)) AS avg_salary\nFROM employees e\nJOIN departments d ON d.id = e.department_id\nGROUP BY d.name\nORDER BY people DESC, department;\n`,
};

const FILE_NAMES: Record<string, string> = {
  python: "main.py",
  javascript: "main.js",
  cpp: "main.cpp",
  java: "Main.java",
  go: "main.go",
  sql: "query.sql",
};

/** Display order in the language rail. */
export const COMPILER_SLUGS = ["python", "javascript", "cpp", "java", "go", "sql"] as const;

/** SQL runs on PostgreSQL inside the browser, not in the Piston sandbox. */
export const isSql = (slug: string) => slug === "sql";

export const COMPILER_LANGS: CompilerLang[] = COMPILER_SLUGS.map((slug) => ({
  slug,
  label: LABELS[slug] ?? slug,
  fileName: FILE_NAMES[slug],
  starter: STARTERS[slug],
}));

const BY_SLUG = new Map(COMPILER_LANGS.map((l) => [l.slug, l]));

export function getCompilerLang(slug: string): CompilerLang | undefined {
  return BY_SLUG.get(slug);
}
