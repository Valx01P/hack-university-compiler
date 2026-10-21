/**
 * Just enough tar for jobs: the runner streams a job's files in with
 * `tar -x` on stdin (Docker's archive API refuses a read-only root), and reads
 * back the files a test left with `tar -c`. POSIX ustar, with pax records for
 * long or non-ASCII paths, the way GNU tar writes `--format=pax`.
 */

export type EntryType = "file" | "dir" | "symlink";

export interface TarEntry {
  path: string;
  type: EntryType;
  data?: Buffer;
  /** Permission bits. */
  mode?: number;
  /** Modification time, in seconds since the epoch. */
  mtime?: number;
  target?: string;
  uid?: number;
  gid?: number;
}

const BLOCK = 512;
const TYPE_FLAG: Record<EntryType, string> = { file: "0", dir: "5", symlink: "2" };

/**
 * Windows keeps no exec bits, so Node reports every file and folder there as
 * 0o666: in a Linux container, a folder no one can enter and a script no one
 * can run. So on Windows a folder with no exec bit gets 0o755, and a file
 * with none gets 0o755 when it starts with "#!" (every executable in the
 * templates is a script) and 0o644 otherwise. Modes that came from a
 * container keep their bits, and elsewhere every mode passes through as is.
 */
function linuxMode(entry: TarEntry, data: Buffer): number | undefined {
  if (process.platform !== "win32" || entry.mode === undefined || entry.mode & 0o111) return entry.mode;
  if (entry.type === "dir") return 0o755;
  if (entry.type === "file") return data[0] === 0x23 && data[1] === 0x21 ? 0o755 : 0o644;
  return entry.mode;
}

/** A tar archive of the entries, owned by learner (1000:1000) unless they say otherwise. */
export function packTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const data = entry.type === "file" ? (entry.data ?? Buffer.alloc(0)) : Buffer.alloc(0);
    const name = entry.type === "dir" && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path;
    const pax: Record<string, string> = {};
    const split = splitName(name);
    if (!split) pax.path = name;
    if (entry.target && (Buffer.byteLength(entry.target) > 100 || !isAscii(entry.target))) pax.linkpath = entry.target;
    if (Object.keys(pax).length) {
      const body = paxRecords(pax);
      parts.push(header({ name: "././@PaxHeader", type: "x", size: body.length, mode: 0o644, mtime: entry.mtime ?? 0 }));
      parts.push(body, padding(body.length));
    }
    parts.push(
      header({
        name: split?.name ?? name.slice(-100),
        prefix: split?.prefix ?? "",
        type: TYPE_FLAG[entry.type],
        size: data.length,
        mode: linuxMode(entry, data) ?? (entry.type === "dir" ? 0o755 : entry.type === "symlink" ? 0o777 : 0o644),
        mtime: entry.mtime ?? Math.floor(Date.now() / 1000),
        linkname: entry.target && !pax.linkpath ? entry.target : "",
        uid: entry.uid ?? 1000,
        gid: entry.gid ?? 1000,
      })
    );
    if (data.length) parts.push(data, padding(data.length));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

/**
 * The entries of a tar archive (ustar, pax, and GNU long names). The bytes may
 * come out of a learner's container, so no length is trusted: parsing stops at
 * the first header whose checksum or size doesn't add up and at an entry the
 * archive cuts short, and every pass moves forward.
 */
export function unpackTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pax: Record<string, string> = {};
  let longName: string | null = null;
  let longLink: string | null = null;
  while (offset + BLOCK <= buf.length) {
    const block = buf.subarray(offset, offset + BLOCK);
    if (block.every((b) => b === 0)) break;
    const size = parseOctal(block.subarray(124, 136));
    if (size === null || !checksumOk(block) || offset + BLOCK + size > buf.length) break;
    const type = String.fromCharCode(block[156] || 48);
    const body = buf.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      pax = { ...pax, ...parsePax(body) };
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      longName = cString(body);
      continue;
    }
    if (type === "K") {
      longLink = cString(body);
      continue;
    }
    const prefix = cString(block.subarray(345, 500));
    const base = cString(block.subarray(0, 100));
    let name = pax.path ?? longName ?? (prefix ? `${prefix}/${base}` : base);
    const target = pax.linkpath ?? longLink ?? cString(block.subarray(157, 257));
    name = name.replace(/^\.\//, "").replace(/\/$/, "");
    pax = {};
    longName = longLink = null;
    const entryType: EntryType | null = type === "0" || type === "\0" || type === "7" ? "file" : type === "5" ? "dir" : type === "2" ? "symlink" : null;
    if (!entryType) continue;
    entries.push({
      path: name,
      type: entryType,
      data: entryType === "file" ? Buffer.from(body) : undefined,
      mode: parseOctal(block.subarray(100, 108)) ?? undefined,
      mtime: parseOctal(block.subarray(136, 148)) ?? undefined,
      target: entryType === "symlink" ? target : undefined,
    });
  }
  return entries;
}

interface Header {
  name: string;
  prefix?: string;
  type: string;
  size: number;
  mode: number;
  mtime: number;
  linkname?: string;
  uid?: number;
  gid?: number;
}

function header(h: Header): Buffer {
  const b = Buffer.alloc(BLOCK);
  b.write(h.name, 0, 100, "utf8");
  octal(b, 100, 8, h.mode & 0o7777);
  octal(b, 108, 8, h.uid ?? 0);
  octal(b, 116, 8, h.gid ?? 0);
  octal(b, 124, 12, h.size);
  octal(b, 136, 12, Math.max(0, Math.floor(h.mtime)));
  b.fill(" ", 148, 156);
  b.write(h.type, 156, 1, "ascii");
  if (h.linkname) b.write(h.linkname, 157, 100, "utf8");
  b.write("ustar\0", 257, 6, "ascii");
  b.write("00", 263, 2, "ascii");
  b.write(h.uid === 1000 ? "learner" : "root", 265, 32, "ascii");
  b.write(h.gid === 1000 ? "learner" : "root", 297, 32, "ascii");
  if (h.prefix) b.write(h.prefix, 345, 155, "utf8");
  let sum = 0;
  for (const byte of b) sum += byte;
  b.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return b;
}

/** A ustar name and prefix for a path, or null when it needs a pax record. */
function splitName(name: string): { name: string; prefix: string } | null {
  if (!isAscii(name)) return null;
  if (name.length <= 100) return { name, prefix: "" };
  for (let i = name.length - 1; i > 0; i--) {
    if (name[i] !== "/") continue;
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (prefix.length <= 155 && rest.length <= 100 && rest.length > 0) return { name: rest, prefix };
  }
  return null;
}

function paxRecords(fields: Record<string, string>): Buffer {
  let out = "";
  for (const [key, value] of Object.entries(fields)) {
    const tail = ` ${key}=${value}\n`;
    let len = Buffer.byteLength(tail) + 1;
    while (String(len).length + Buffer.byteLength(tail) !== len) len = String(len).length + Buffer.byteLength(tail);
    out += `${len}${tail}`;
  }
  return Buffer.from(out, "utf8");
}

/** pax records, each "<len> <key>=<value>\n" with len counting the whole
    record. Parsing stops at the first record that doesn't add up. */
function parsePax(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const space = body.indexOf(0x20, i);
    if (space < 0) break;
    const digits = body.subarray(i, space).toString("latin1");
    if (!/^\d{1,9}$/.test(digits)) break;
    const len = Number(digits);
    // A record holds its length, the space, and at least its newline, so i
    // always moves forward.
    if (len <= digits.length + 1 || i + len > body.length || body[i + len - 1] !== 0x0a) break;
    const record = body.subarray(space + 1, i + len - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

function octal(b: Buffer, at: number, width: number, value: number) {
  b.write(`${value.toString(8).padStart(width - 1, "0")}\0`, at, width, "ascii");
}

/** An octal header field, or null when it isn't one (a minus sign, other
    digits, or GNU's base-256 for huge numbers). */
function parseOctal(field: Buffer): number | null {
  const text = cString(field).trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) return null;
  const value = parseInt(text, 8);
  return Number.isSafeInteger(value) ? value : null;
}

/** Whether a header's checksum adds up: the sum of its bytes with the
    checksum field read as spaces (signed, too, as some old tars wrote it). */
function checksumOk(block: Buffer): boolean {
  const want = parseOctal(block.subarray(148, 156));
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i++) {
    const b = i >= 148 && i < 156 ? 0x20 : block[i];
    unsigned += b;
    signed += b > 127 ? b - 256 : b;
  }
  return want === unsigned || want === signed;
}

function cString(field: Buffer): string {
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? field.length : end).toString("utf8");
}

function padding(size: number): Buffer {
  return Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);
}

function isAscii(s: string): boolean {
  return /^[\x20-\x7e]*$/.test(s);
}
