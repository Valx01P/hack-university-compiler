// npm run dev: the mock API and Vite in one terminal. Each line of their output gets an [api] or
// [web] prefix, Ctrl+C stops both, and when either one exits the other stops too, so Vite never
// keeps serving an app whose API is gone. In a workspace, API_PORT and WEB_PORT are already set
// to the ports leased for it; elsewhere the defaults below apply.
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const viteBin = join(dirname(fileURLToPath(import.meta.resolve("vite/package.json"))), "bin", "vite.js");

const env = {
  ...process.env,
  API_PORT: process.env.API_PORT ?? "3001",
  WEB_PORT: process.env.WEB_PORT ?? "5173",
  // The children write to a pipe, not a terminal, so they would drop their colors without this.
  FORCE_COLOR: process.env.NO_COLOR ? "0" : (process.env.FORCE_COLOR ?? "1"),
};

const services = [
  { name: "api", color: 35, args: ["--watch", "api/server.ts"], stdin: "ignore" as const },
  { name: "web", color: 36, args: [viteBin, "--configLoader", "native"], stdin: "inherit" as const },
];

const children: ChildProcess[] = [];
let stopping = false;

function stop(exitCode: number): void {
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

for (const service of services) {
  const prefix = env.FORCE_COLOR === "0" ? `[${service.name}] ` : `\x1b[${service.color}m[${service.name}]\x1b[0m `;
  const child = spawn(process.execPath, service.args, { env, stdio: [service.stdin, "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => console.log(prefix + line));
  }
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.log(`${prefix}stopped (${signal ?? `exit code ${code}`}), so the other server stops too`);
    stop(code ?? 1);
  });
  children.push(child);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
