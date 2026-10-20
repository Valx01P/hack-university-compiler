// Prints three slugs, made by src/slug.ts. Create that file: it exports slugify(title) and the
// Slug type. Then run: node src/main.ts
import { slugify, type Slug } from "./slug.ts";

const titles = ["Summer Jazz Night", "Q&A with the Band", "  2026 Tour!  "];
const slugs: Slug[] = titles.map(slugify);
for (const slug of slugs) console.log(slug);
