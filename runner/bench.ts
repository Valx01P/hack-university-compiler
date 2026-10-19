import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { dataDir } from "./config.ts";

/**
 * Times the job path end to end, the way Next.js calls it: POST /v1/run on a
 * running runner, from the request to the full answer. It checks the
 * performance budgets of PLAN.md 7.3 (P0 acceptance) and 8.7.
 *
 *   npm run runner &                    # or npm run up
 *   node runner/bench.ts                # 40 of each
 *   node runner/bench.ts --runs=100
 *
 * It reads the token from HU_RUNNER_TOKEN or ~/.hack-university/runner-token.
 */

const port = Number(process.env.HU_RUNNER_PORT) || 3100;
const token = process.env.HU_RUNNER_TOKEN?.trim() || readFileSync(path.join(dataDir(), "runner-token"), "utf8").trim();
const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 40);

function post(body: unknown): Promise<{ ms: number; json: any }> {
  const payload = JSON.stringify(body);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/v1/run",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          const json = JSON.parse(raw);
          if (res.statusCode !== 200) reject(new Error(`${res.statusCode}: ${raw}`));
          else resolve({ ms: performance.now() - started, json });
        });
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

const TS_PROGRAM = [
  'import * as z from "zod";',
  'import { readFileSync } from "node:fs";',
  "const Order = z.object({ id: z.number(), total: z.number() });",
  "type Order = z.infer<typeof Order>;",
  "const orders: Order[] = JSON.parse(readFileSync(0, \"utf8\")).map((o: unknown) => Order.parse(o));",
  "const sum = orders.reduce((s, o) => s + o.total, 0);",
  "console.log(`${orders.length} orders, ${sum.toFixed(2)} in total`);",
].join("\n");
const STDIN = JSON.stringify([{ id: 1, total: 9.5 }, { id: 2, total: 20 }]);

const BASH_PROGRAM = 'set -euo pipefail\nwhile IFS=, read -r name qty; do echo "$name: $((qty * 2))"; done < items.csv\necho "args: $*"\n';
const FIXTURES = { box: [{ name: "items.csv", content: "apples,3\npears,5\n" }] };

const cases: { name: string; budgetMs: number; body: unknown; check: (json: any) => boolean }[] = [
  {
    name: "TypeScript Run (tsc, then node)",
    budgetMs: 400,
    body: { recipe: "typescript", files: [{ name: "main.ts", content: TS_PROGRAM }], stdin: STDIN },
    check: (j) => j.run.stdout === "2 orders, 29.50 in total\n",
  },
  {
    name: "TypeScript Check, 3 tests (tsc once)",
    budgetMs: 1500,
    body: { recipe: "typescript", files: [{ name: "main.ts", content: TS_PROGRAM }], tests: [{ stdin: STDIN }, { stdin: "[]" }, { stdin: STDIN }] },
    check: (j) => j.results.length === 3 && j.results[1].stdout === "0 orders, 0.00 in total\n",
  },
  {
    name: "Bash Run",
    budgetMs: 300,
    body: { recipe: "bash", files: [{ name: "main.sh", content: BASH_PROGRAM }], args: ["x"], fixtures: "box", fixtureSets: FIXTURES },
    check: (j) => j.run.stdout === "apples: 6\npears: 10\nargs: x\n",
  },
  {
    name: "Bash Check, 3 tests (a fresh copy each)",
    budgetMs: 1500,
    body: { recipe: "bash", files: [{ name: "main.sh", content: BASH_PROGRAM }], fixtures: "box", fixtureSets: FIXTURES, tests: [{}, { args: ["y"] }, {}] },
    check: (j) => j.results.length === 3 && j.results[1].stdout.endsWith("args: y\n"),
  },
];

const percentile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
let over = false;
for (const c of cases) {
  // One warm-up, so the first run's image loading doesn't count.
  await post(c.body);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const { ms, json } = await post(c.body);
    if (!c.check(json)) throw new Error(`${c.name} answered wrong: ${JSON.stringify(json).slice(0, 400)}`);
    times.push(ms);
  }
  times.sort((a, b) => a - b);
  const p95 = percentile(times, 0.95);
  const ok = p95 < c.budgetMs;
  over ||= !ok;
  console.log(
    `${ok ? "✓" : "✗"} ${c.name}: p50 ${Math.round(percentile(times, 0.5))} ms, p95 ${Math.round(p95)} ms, max ${Math.round(times.at(-1) ?? 0)} ms (budget p95 under ${c.budgetMs} ms, ${runs} runs)`
  );
}
process.exitCode = over ? 1 : 0;
