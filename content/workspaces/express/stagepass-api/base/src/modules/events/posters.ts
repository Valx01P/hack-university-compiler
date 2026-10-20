// Poster uploads. Everything about an upload is a claim: the type the client states and the
// file name it sends can both lie. So the type comes from the file's first bytes, the name is
// generated, and files live in UPLOAD_DIR/posters, served by their own route with nosniff,
// never from public/.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import multer from "multer";

export type PosterType = "png" | "jpeg" | "webp";

export const MAX_POSTER_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<PosterType, string> = { png: "png", jpeg: "jpg", webp: "webp" };
const MIME_TYPES: Record<PosterType, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
const KEY = /^posters\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

/** One file in the "poster" field, kept in memory (at most 2 MB) until it has been checked. */
export const posterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POSTER_BYTES, files: 1, fields: 0, parts: 1 },
}).single("poster");

/** The real type from the magic bytes: PNG, JPEG, or WebP, else null. */
export function sniffImageType(bytes: Buffer): PosterType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export function mimeTypeOf(type: PosterType): string {
  return MIME_TYPES[type];
}

export class PosterStorage {
  readonly #uploadDir: string;

  constructor(uploadDir: string) {
    this.#uploadDir = uploadDir;
  }

  get postersDir(): string {
    return join(this.#uploadDir, "posters");
  }

  /** Writes the file under a new random name and returns its storage key, such as posters/<uuid>.png. */
  async save(bytes: Buffer, type: PosterType): Promise<string> {
    const key = `posters/${randomUUID()}.${EXTENSIONS[type]}`;
    await mkdir(this.postersDir, { recursive: true });
    // "wx" refuses to overwrite, so a name collision fails instead of replacing another poster.
    await writeFile(join(this.#uploadDir, key), bytes, { flag: "wx" });
    return key;
  }

  /** Deletes a stored poster. Keys that are not ours are ignored, so a bad row cannot delete other files. */
  async remove(key: string): Promise<void> {
    if (!KEY.test(key)) return;
    try {
      await unlink(join(this.#uploadDir, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

/** The public URL of a stored poster. */
export function posterUrl(key: string | null): string | null {
  return key === null ? null : `/uploads/${key}`;
}
