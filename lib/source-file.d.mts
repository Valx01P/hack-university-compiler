// Types for lib/source-file.mjs (plain JavaScript so the Node verifiers can use it).
export function isEsModule(code: string): boolean;
export function sourceFileName(language: string, code: string): string | undefined;
export function hasTopLevelAwait(code: string): boolean;
export function javaTypes(code: string): { name: string; public: boolean; main: boolean }[];
export function javaEntry(code: string): { run: string; file: string } | null;
export const JAVA_ENTRY_FILE: string;
export function sourceFiles(language: string, code: string): { name: string | undefined; content: string }[];
