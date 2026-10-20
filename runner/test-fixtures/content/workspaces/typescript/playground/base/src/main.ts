// The playground's program: `npm start` runs it once, and `npm run dev` runs it again
// every time you save. It reads data/sample.json through a zod schema, so the records
// it works with have real types instead of the any that JSON.parse returns.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as z from "zod";
import { greet } from "./greet.ts";

const Sample = z.object({
  id: z.number().int(),
  name: z.string(),
  tags: z.array(z.string()),
  active: z.boolean(),
});
type Sample = z.infer<typeof Sample>;

// import.meta.dirname is this file's folder, so the path works from any directory.
const file = join(import.meta.dirname, "..", "data", "sample.json");
const samples: Sample[] = z.array(Sample).parse(JSON.parse(await readFile(file, "utf8")));

console.log(greet("TypeScript"));
const active = samples.filter((sample) => sample.active);
console.log(`${samples.length} records, ${active.length} active: ${active.map((sample) => sample.name).join(", ")}`);
const tags = [...new Set(samples.flatMap((sample) => sample.tags))].sort();
console.log(`tags: ${tags.join(", ")}`);
