import zlib from "node:zlib";
import type { TarEntry } from "./tar.ts";

/**
 * Just enough ZIP for "Download" (GET …/archive): files deflated, folders as
 * entries, Unix modes in the external attributes. Links are left out, so an
 * archive never carries one that points out of the workspace (S17).
 */

const DOS_EPOCH = new Date("1980-01-01T00:00:00Z").getTime();

function dosTime(seconds: number): { time: number; date: number } {
  const d = new Date(Math.max(DOS_EPOCH, seconds * 1000));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

export function zip(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    if (e.type === "symlink") continue;
    const dir = e.type === "dir";
    const name = Buffer.from(dir ? `${e.path}/` : e.path, "utf8");
    const raw = dir ? Buffer.alloc(0) : (e.data ?? Buffer.alloc(0));
    const deflated = raw.length ? zlib.deflateRawSync(raw) : Buffer.alloc(0);
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const crc = zlib.crc32(raw) >>> 0;
    const { time, date } = dosTime(e.mtime ?? Math.floor(Date.now() / 1000));
    const mode = (dir ? 0o040000 : 0o100000) | ((e.mode ?? (dir ? 0o755 : 0o644)) & 0o7777);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(stored ? 0 : 8, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(((mode << 16) | (dir ? 0x10 : 0)) >>> 0, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = central.length / 2;
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
