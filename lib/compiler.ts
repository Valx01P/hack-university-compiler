/**
 * Config for the compiler, one entry per language, each rendered as its own
 * page at /<slug>. Pure data (no server deps), safe to import from client and
 * server. The sandbox side of each language lives in lib/runtimes.json.
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
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python 3",
  cpp: "C++",
  c: "C",
  java: "Java",
  go: "Go",
  rust: "Rust",
  csharp: "C#",
  kotlin: "Kotlin",
  swift: "Swift",
  ruby: "Ruby",
  php: "PHP",
  haskell: "Haskell",
  lua: "Lua",
  elixir: "Elixir",
  perl: "Perl",
  bash: "Bash",
  sql: "SQL",
};

const MSG = "Start small. Ship something.";

const STARTERS: Record<string, string> = {
  python: `# Online Python compiler. Write and run Python in your browser.\nprint("${MSG}")\n`,
  javascript: `// Online JavaScript compiler. Write and run JS in your browser.\nconsole.log("${MSG}");\n`,
  typescript: `// Online TypeScript compiler. Write and run TS in your browser.\nconst message: string = "${MSG}";\nconsole.log(message);\n`,
  c: `// Online C compiler. Write and run C in your browser.\n#include <stdio.h>\n\nint main(void) {\n    printf("${MSG}\\n");\n    return 0;\n}\n`,
  cpp: `// Online C++ compiler. Write and run C++ in your browser.\n#include <iostream>\n\nint main() {\n    std::cout << "${MSG}" << std::endl;\n    return 0;\n}\n`,
  java: `// Online Java compiler. Write and run Java in your browser.\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("${MSG}");\n    }\n}\n`,
  go: `// Online Go compiler. Write and run Go in your browser.\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${MSG}")\n}\n`,
  rust: `// Online Rust compiler. Write and run Rust in your browser.\nfn main() {\n    println!("${MSG}");\n}\n`,
  bash: `# Online Bash shell. Write and run Bash in your browser.\necho "${MSG}"\n`,
  sql: `-- Online SQL playground (SQLite). A sample database is loaded.\n-- Open the "Database" tab to see the employees & departments tables.\nSELECT name, salary\nFROM employees\nORDER BY salary DESC;\n`,
  csharp: `// Online C# compiler. Write and run C# in your browser.\nusing System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("${MSG}");\n    }\n}\n`,
  kotlin: `// Online Kotlin compiler. Write and run Kotlin in your browser.\nfun main() {\n    println("${MSG}")\n}\n`,
  swift: `// Online Swift compiler. Write and run Swift in your browser.\nprint("${MSG}")\n`,
  perl: `# Online Perl compiler. Write and run Perl in your browser.\nprint "${MSG}\\n";\n`,
  lua: `-- Online Lua compiler. Write and run Lua in your browser.\nprint("${MSG}")\n`,
  elixir: `# Online Elixir compiler. Write and run Elixir in your browser.\nIO.puts("${MSG}")\n`,
  haskell: `-- Online Haskell compiler. Write and run Haskell in your browser.\nmain :: IO ()\nmain = putStrLn "${MSG}"\n`,
  ruby: `# Online Ruby compiler. Write and run Ruby in your browser.\nputs "${MSG}"\n`,
  php: `<?php\n// Online PHP compiler. Write and run PHP in your browser.\necho "${MSG}\\n";\n`,
};

const FILE_NAMES: Record<string, string> = {
  python: "main.py",
  javascript: "main.js",
  typescript: "main.ts",
  c: "main.c",
  cpp: "main.cpp",
  java: "Main.java",
  go: "main.go",
  rust: "main.rs",
  bash: "main.sh",
  sql: "query.sql",
  csharp: "Main.cs",
  kotlin: "Main.kt",
  swift: "main.swift",
  perl: "main.pl",
  lua: "main.lua",
  elixir: "main.exs",
  haskell: "main.hs",
  ruby: "main.rb",
  php: "main.php",
};

/** Display order in the language rail. */
export const COMPILER_SLUGS = [
  "python",
  "javascript",
  "typescript",
  "c",
  "cpp",
  "csharp",
  "java",
  "kotlin",
  "swift",
  "go",
  "rust",
  "haskell",
  "lua",
  "elixir",
  "perl",
  "ruby",
  "php",
  "bash",
  "sql",
] as const;

/** Columns of the Menu dropdown, grouped by language family. */
export const COMPILER_GROUPS: { label: string; slugs: string[] }[] = [
  { label: "Scripting", slugs: ["python", "javascript", "typescript", "ruby", "php", "perl", "lua"] },
  { label: "Systems", slugs: ["c", "cpp", "rust", "go", "swift"] },
  { label: "JVM & .NET", slugs: ["java", "kotlin", "csharp"] },
  { label: "Functional", slugs: ["haskell", "elixir"] },
  { label: "Shell & Data", slugs: ["bash", "sql"] },
];

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
