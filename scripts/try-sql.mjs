#!/usr/bin/env node
// Runs SQL on a fresh PostgreSQL 18 (PGlite) and prints what psql would, the
// same way the app and the verifiers do. Handy while writing SQL content.
//
//   node scripts/try-sql.mjs query.sql
//   node scripts/try-sql.mjs query.sql --setup tables.sql
//   echo "SELECT 1 + 1;" | node scripts/try-sql.mjs
//   node scripts/try-sql.mjs --sample query.sql     # on the playground's sample database
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { formatError, formatRun, prepareDatabase, runSql } from "../lib/sql/core.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const setupFile = flag("--setup");
const sample = args.includes("--sample");
const file = args.find((a) => !a.startsWith("--"));
const code = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");

const db = await prepareDatabase(new PGlite());
if (sample) {
  const src = readFileSync(new URL("../lib/sql/sample-db.ts", import.meta.url), "utf8");
  await db.exec(src.slice(src.indexOf("`") + 1, src.lastIndexOf("`")));
}
if (setupFile) {
  const setup = await runSql(db, readFileSync(setupFile, "utf8"));
  if (setup.error) {
    console.error(`The setup failed. ${formatError(setup.error)}`);
    process.exit(1);
  }
}
const run = await runSql(db, code);
if (run.results.length) console.log(formatRun(run));
if (run.error) {
  console.error(formatError(run.error));
  process.exitCode = 1;
}
await db.close();
