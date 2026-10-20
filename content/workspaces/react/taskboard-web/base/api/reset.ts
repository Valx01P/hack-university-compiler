// npm run api:reset: copies api/seed.json over api/data/db.json, so every project, task, comment,
// and session goes back to the seed. A running server sees the change on its next request.
import { relative } from "node:path";
import { DB_FILE, resetDb, SEED_FILE } from "./db.ts";

resetDb();
console.log(`Restored ${relative(process.cwd(), DB_FILE)} from ${relative(process.cwd(), SEED_FILE)}.`);
