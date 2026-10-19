import { COMPILER_COURSES, getCourseEntry, runtimeKindOf } from "@/lib/courses";

/**
 * Config for the compiler pages, one per course whose /<slug> is the
 * single-file compiler. The courses, their labels, file names, and runtimes
 * come from the course registry (content/courses.json, typed in
 * lib/courses.ts). This file adds what a page starts with. Pure data (no
 * server deps), safe to import from client and server. Piston's side of each
 * language lives in lib/runtimes.json, SQL runs on PostgreSQL in the browser
 * (lib/sql), and TypeScript and Bash run on the local runner (lib/runner.ts).
 */
export interface CompilerLang {
  slug: string;
  label: string;
  /** Display file name in the editor tab (main.cpp, Main.java…). */
  fileName: string;
  /** Default starter program shown on a fresh page. */
  starter: string;
  /** What runs it: piston:<id>, pglite, or runner:<recipe>. */
  runtime: string;
  /** An Arguments field next to stdin, for the program's command line. */
  args: boolean;
}

/** Fired after every run so the sandbox badge re-checks (a failed run is
    often the first sign the sandbox stopped or a runtime is missing). */
export const SANDBOX_REFRESH_EVENT = "hu:sandbox-refresh";

const MSG = "Start small. Ship something.";

const STARTERS: Record<string, string> = {
  python: `# Online Python compiler. Write and run Python in your browser.\nprint("${MSG}")\n`,
  javascript: `// Online JavaScript compiler. Write and run JS in your browser.\nconsole.log("${MSG}");\n`,
  typescript: `// Online TypeScript compiler. Write and run TypeScript in your browser.\nconst message: string = "${MSG}";\nconsole.log(message);\n`,
  cpp: `// Online C++ compiler. Write and run C++ in your browser.\n#include <iostream>\n\nint main() {\n    std::cout << "${MSG}" << std::endl;\n    return 0;\n}\n`,
  java: `// Online Java compiler. Write and run Java in your browser.\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("${MSG}");\n    }\n}\n`,
  go: `// Online Go compiler. Write and run Go in your browser.\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${MSG}")\n}\n`,
  sql: `-- PostgreSQL in your browser. The sample database has departments,\n-- employees, customers, products, orders, and order_items.\nSELECT d.name AS department, count(*) AS people, round(avg(e.salary)) AS avg_salary\nFROM employees e\nJOIN departments d ON d.id = e.department_id\nGROUP BY d.name\nORDER BY people DESC, department;\n`,
  bash: `# Online Bash compiler. Write and run Bash in your browser.\necho "${MSG}"\n`,
};

/** What the sandbox badge says runs a runner course (Piston's runtimes
    report their own versions), and the runner's image it runs in. */
export const RUNNER_LABELS: Record<string, { name: string; image: string }> = {
  typescript: { name: "TypeScript 7.0.2 on Node 26.12.0", image: "hu/node" },
  bash: { name: "Bash 5.3", image: "hu/bash" },
};

/** SQL runs on PostgreSQL inside the browser, not in a sandbox. */
export const isSql = (slug: string) => getCourseEntry(slug)?.runtime === "pglite";

/** TypeScript, Bash, and the stack courses run on the local runner. */
export const onRunner = (slug: string) => runtimeKindOf(slug) === "runner";

const BY_SLUG = new Map<string, CompilerLang>(
  COMPILER_COURSES.filter((c) => c.page === "single").map((c) => [
    c.slug,
    {
      slug: c.slug,
      label: c.label,
      fileName: c.fileName ?? "main",
      starter: STARTERS[c.slug] ?? "",
      runtime: c.runtime,
      args: Boolean(c.args),
    },
  ])
);

/** The single-file compiler for a course, when its page is one. */
export function getCompilerLang(slug: string): CompilerLang | undefined {
  return BY_SLUG.get(slug);
}
