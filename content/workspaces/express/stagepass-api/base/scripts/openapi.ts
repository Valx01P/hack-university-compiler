// npm run openapi: writes openapi.json, the same document GET /openapi.json serves, for code
// generators and API tools. Built from the zod schemas, so it needs no database and no server.
import { readFileSync, writeFileSync } from "node:fs";
import { routeDocs } from "../src/app.ts";
import { buildOpenApi } from "../src/http/openapi.ts";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const document = buildOpenApi(routeDocs, version);
writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote openapi.json: ${Object.keys(document.paths as object).length} paths, ${routeDocs.length} operations`);
