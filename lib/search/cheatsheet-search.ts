import fs from "node:fs";
import path from "node:path";
import { getCheatsheet } from "@/lib/reference";
import { cheatsheetBlocks, type CheatsheetHit } from "@/lib/reference-blocks";

/**
 * Search for the cheatsheets, run on this machine. Each "###" block of a
 * language's cheatsheet is ranked against the query by two signals:
 *
 * - Meaning: a static embedding model (Model2Vec potion-base-8M, a word
 *   vector table distilled from a sentence transformer, MIT licensed) turns
 *   the query and each block into vectors, compared by cosine similarity.
 *   `npm run search:setup` downloads it into .models/. Without it, search
 *   still works on the words alone.
 * - Words: query words found in the block, after stemming, weighted by
 *   where they are (the section's topic and the block's heading count most,
 *   then its prose, then its code) and by how rare they are, plus synonyms
 *   across languages (a "dictionary" is a Map in JavaScript and Java) and
 *   prefix matches for the word being typed.
 *
 * A query for "X methods" also favors blocks on X that call many methods,
 * and a block containing the query's exact text gets a bonus.
 */

// --- The embedding model ---------------------------------------------------

const MODEL_DIR = path.join(process.cwd(), ".models", "potion-base-8M");

interface Model {
  vocab: Map<string, number>;
  vectors: Float32Array;
  dim: number;
}

let model: Model | null | undefined;

/** The model, loaded once, or null when it isn't installed. */
function loadModel(): Model | null {
  if (model !== undefined) return model;
  try {
    const buf = fs.readFileSync(path.join(MODEL_DIR, "model.safetensors"));
    const headerLength = Number(buf.readBigUInt64LE(0));
    const header = JSON.parse(buf.subarray(8, 8 + headerLength).toString("utf8")) as Record<
      string,
      { dtype: string; shape: number[]; data_offsets: [number, number] }
    >;
    const tensor = Object.entries(header).find(([name]) => name !== "__metadata__")?.[1];
    if (!tensor || tensor.dtype !== "F32" || tensor.shape.length !== 2) throw new Error("unexpected model format");
    const [rows, dim] = tensor.shape;
    const start = 8 + headerLength + tensor.data_offsets[0];
    const vectors = new Float32Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + start + rows * dim * 4));
    const tokenizer = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, "tokenizer.json"), "utf8")) as {
      model: { vocab: Record<string, number> };
    };
    model = { vocab: new Map(Object.entries(tokenizer.model.vocab)), vectors, dim };
  } catch {
    model = null;
  }
  return model;
}

const PUNCTUATION = /[\p{P}\p{S}]/u;

/** BERT-style WordPiece token ids (lowercased, accents stripped, punctuation
    split off), dropping words the vocabulary can't spell. */
function tokenIds(text: string, vocab: Map<string, number>): number[] {
  const ids: number[] = [];
  const normalized = text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  for (const chunk of normalized.split(/\s+/)) {
    const words: string[] = [];
    let current = "";
    for (const c of chunk) {
      if (PUNCTUATION.test(c)) {
        if (current) words.push(current);
        words.push(c);
        current = "";
      } else current += c;
    }
    if (current) words.push(current);
    for (const word of words) {
      if (word.length > 100) continue;
      const pieces: number[] = [];
      let at = 0;
      while (at < word.length) {
        let end = word.length;
        let found: number | undefined;
        while (at < end) {
          found = vocab.get((at > 0 ? "##" : "") + word.slice(at, end));
          if (found !== undefined) break;
          end--;
        }
        if (found === undefined) {
          pieces.length = 0;
          break;
        }
        pieces.push(found);
        at = end;
      }
      ids.push(...pieces);
    }
  }
  return ids;
}

/** The normalized mean of the text's token vectors. */
function embed(text: string, m: Model): Float32Array {
  const v = new Float32Array(m.dim);
  for (const id of tokenIds(text, m.vocab)) {
    const row = id * m.dim;
    for (let j = 0; j < m.dim; j++) v[j] += m.vectors[row + j];
  }
  let norm = 0;
  for (let j = 0; j < m.dim; j++) norm += v[j] * v[j];
  norm = Math.sqrt(norm) || 1;
  for (let j = 0; j < m.dim; j++) v[j] /= norm;
  return v;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += a[j] * b[j];
  return s;
}

// --- Words -----------------------------------------------------------------

const STOP = new Set(
  "a an the to of in on for and or with how do does i my me is are be it its by from as at this that what when which into out up can use using get".split(" ")
);

/** Plurals, -ed, and -ing off (Porter's first step), so "lists", "listed",
    and "listing" all match "list". */
function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  const m = /^(.*?[aeiouy].*?)(?:ing|ed)$/.exec(w);
  if (m) {
    w = m[1];
    if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1);
  }
  return w;
}

/** Stemmed words, with camelCase and snake_case names also split into their
    parts (containsKey: containskey, contains, key). */
function words(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    const parts = raw.split(/_|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
    for (const w of new Set([raw, ...(parts.length > 1 ? parts : [])].map((x) => x.toLowerCase()))) {
      if (!STOP.has(w)) out.push(stem(w));
    }
  }
  return out;
}

// Names of things, matched against a section's topic only: "list" finds
// Go's slices and Java's ArrayList, but not Python's slicing.
const TOPIC_SYNONYMS: Record<string, string> = {
  list: "array arraylist vector slice", array: "list vector slice arraylist", arraylist: "list array",
  vector: "list array", slice: "list array", dictionary: "dict map hashmap object", dict: "dictionary map hashmap",
  map: "dictionary dict hashmap", hashmap: "dictionary dict map", key: "map dictionary dict hashmap",
  string: "str text", str: "string", set: "hashset", hashset: "set", tuple: "pair", pair: "tuple", queue: "deque",
  stack: "deque", heap: "priority heapq", priority: "heap heapq", exception: "error", error: "exception",
  function: "method", method: "function", class: "object", null: "none nil undefined", none: "null nil",
  nil: "null none", undefined: "null none", input: "read stdin", print: "output",
};
// Other words, matched anywhere.
const WORD_SYNONYMS: Record<string, string> = {
  remove: "delete del pop erase discard", delete: "remove del erase", add: "append insert push put",
  append: "add push insert", insert: "add push", push: "add append", length: "len size count", size: "length len",
  len: "length size", convert: "parse cast", parse: "convert", int: "integer number parseint", integer: "int",
  exist: "contain has include", contain: "include has", include: "contain has", loop: "for while iterate",
  iterate: "loop for", catch: "except", except: "catch", try: "catch except", throw: "raise", raise: "throw",
  format: "printf formatting", decimal: "float round digit precision", random: "rand", sort: "sorted order",
  reverse: "backward", copy: "clone duplicate", lambda: "anonymous arrow", constructor: "init new",
  unique: "distinct set", read: "input scanner stdin",
};
const synonyms = (table: Record<string, string>, w: string) =>
  (Object.hasOwn(table, w) ? table[w] : "").split(" ").filter(Boolean).map(stem);

// Words that ask for "the methods of X" rather than name a topic.
const METHOD_WORDS = new Set(["method", "function", "operation", "way"].map(stem));
// Words that frame a question more than say what it's about.
const SOFT = new Set(["check", "find", "make", "want", "need", "if", "whether", "value", "thing", "all", "each", "every", "new"].map(stem));

const FIELD_WEIGHT = { topic: 3, heading: 3, prose: 1.5, code: 1 } as const;
type Field = keyof typeof FIELD_WEIGHT;
const FIELDS = Object.keys(FIELD_WEIGHT) as Field[];

// --- The index -------------------------------------------------------------

interface IndexedBlock {
  section: string;
  block: number;
  /** Lowercased text, for exact matches. */
  text: string;
  fields: Record<Field, Set<string>>;
  /** Every word, for prefix matches. */
  all: string[];
  /** How many different methods its code calls. */
  methods: number;
  /** Embeddings of the whole block and of its title and heading. */
  body: Float32Array | null;
  head: Float32Array | null;
}

interface LanguageIndex {
  signature: string;
  blocks: IndexedBlock[];
  documentFrequency: Map<string, number>;
}

const indexes = new Map<string, LanguageIndex>();

/** What each topic is called beyond the language's own title: the shared
    title, and words from it, its id, and its roadmap line (without asides). */
function topicWords(lang: string): Map<string, { title: string; words: string }> {
  const root = path.join(process.cwd(), "content", "reference");
  const own = path.join(root, lang, "categories.json");
  const file = fs.existsSync(own) ? own : path.join(root, "categories.json");
  const { categories } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    categories: { id: string; title: string; roadmap?: string }[];
  };
  return new Map(
    categories.map((c) => [
      c.id,
      { title: c.title, words: `${c.title} ${c.id.replace(/-/g, " ")} ${(c.roadmap ?? "").replace(/\([^)]*\)/g, " ")}` },
    ])
  );
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

async function indexFor(lang: string): Promise<LanguageIndex> {
  const sections = await getCheatsheet(lang);
  const m = loadModel();
  // Rebuilt when the content changes (while editing it in dev).
  const signature = `${m ? "m" : "w"}:${hash(sections.map((s) => s.id + s.md).join("\u0000"))}`;
  const cached = indexes.get(lang);
  if (cached?.signature === signature) return cached;

  const topics = topicWords(lang);
  const blocks: IndexedBlock[] = [];
  for (const s of sections) {
    cheatsheetBlocks(s.md).forEach((raw, block) => {
      const heading = /^### (.+)$/m.exec(raw)?.[1] ?? "";
      const code = [...raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((x) => x[1]).join("\n");
      const prose = raw.replace(/```[\s\S]*?```/g, " ").replace(/^#+ .+$/gm, " ");
      const fields: Record<Field, Set<string>> = {
        topic: new Set(words(`${s.title} ${topics.get(s.id)?.words ?? ""}`)),
        heading: new Set(words(heading)),
        prose: new Set(words(prose)),
        code: new Set(words(code)),
      };
      blocks.push({
        section: s.id,
        block,
        text: raw.toLowerCase(),
        fields,
        all: [...new Set(FIELDS.flatMap((f) => [...fields[f]]))],
        methods: new Set([...code.matchAll(/\.([A-Za-z_]\w*)\s*\(/g)].map((x) => x[1])).size,
        body: m ? embed(`${s.title}: ${heading}. ${prose} ${code}`, m) : null,
        head: m ? embed(`${s.title} (${topics.get(s.id)?.title ?? ""}): ${heading}`, m) : null,
      });
    });
  }
  const documentFrequency = new Map<string, number>();
  for (const b of blocks) for (const w of b.all) documentFrequency.set(w, (documentFrequency.get(w) ?? 0) + 1);
  const index = { signature, blocks, documentFrequency };
  indexes.set(lang, index);
  return index;
}

// --- Ranking ---------------------------------------------------------------

/** How well the query's words match a block, from 0 to 1. The last word
    also matches as a prefix, since it may still be being typed. */
function wordScore(terms: string[], b: IndexedBlock, idf: (w: string) => number): number {
  let got = 0;
  let max = 0;
  terms.forEach((t, i) => {
    // Every way to match t, each scored by how rare t itself is.
    let best = 0;
    for (const f of FIELDS) if (b.fields[f].has(t)) best = Math.max(best, FIELD_WEIGHT[f]);
    for (const w of synonyms(WORD_SYNONYMS, t)) for (const f of FIELDS) if (b.fields[f].has(w)) best = Math.max(best, FIELD_WEIGHT[f] * 0.6);
    for (const w of synonyms(TOPIC_SYNONYMS, t)) if (b.fields.topic.has(w)) best = Math.max(best, FIELD_WEIGHT.topic * 0.8);
    if (!best && i === terms.length - 1 && t.length >= 3 && b.all.some((w) => w.startsWith(t))) best = 1.2;
    const soft = SOFT.has(t) ? 0.3 : 1;
    got += soft * best * idf(t);
    max += soft * 3 * idf(t);
  });
  return max ? got / max : 0;
}

/**
 * The blocks of `lang`'s cheatsheet that best match `query`, best first:
 * those within reach of the best one, at most 12. `semantic` says whether
 * the embedding model took part.
 */
export async function searchCheatsheet(lang: string, query: string): Promise<{ hits: CheatsheetHit[]; semantic: boolean }> {
  const q = query.trim().toLowerCase().slice(0, 200);
  const index = await indexFor(lang);
  const m = loadModel();
  const all = words(q);
  if (!q || !all.length) return { hits: [], semantic: Boolean(m) };
  const terms = all.length > 1 ? all.filter((t) => !METHOD_WORDS.has(t)) : all;
  const wantsMethods = all.some((t) => METHOD_WORDS.has(t));
  const idf = (w: string) => Math.log(1 + index.blocks.length / (1 + (index.documentFrequency.get(w) ?? 0)));
  // The meaning of what the query is about, without words that only frame
  // it ("check if key exists" means "key exists").
  const about = q.split(/\s+/).filter((w) => !SOFT.has(stem(w)) && !STOP.has(w)).join(" ") || q;
  const qv = m ? embed(about, m) : null;

  const scored = index.blocks.map((b) => {
    const onTopic = terms.some((t) => !SOFT.has(t) && [t, ...synonyms(TOPIC_SYNONYMS, t)].some((w) => b.fields.topic.has(w)));
    const meaning = qv && b.head && b.body ? 0.5 * cosine(qv, b.head) + 0.5 * cosine(qv, b.body) : 0;
    const score =
      meaning +
      (qv ? 0.6 : 1) * wordScore(terms, b, idf) +
      (wantsMethods && onTopic ? 0.15 * Math.min(1, b.methods / 6) : 0) +
      (q.length >= 3 && b.text.includes(q) ? 0.3 : 0);
    return { section: b.section, block: b.block, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  // Below this, nothing really matched (a nonsense query scores about 0.27).
  if (best < (qv ? 0.4 : 0.15)) return { hits: [], semantic: Boolean(m) };
  const hits = scored
    .filter((s) => s.score >= best * 0.7)
    .slice(0, 12)
    .map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 }));
  return { hits, semantic: Boolean(m) };
}
