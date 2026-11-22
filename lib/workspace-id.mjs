// Workspace identity (architecture §4.2.1), shared by Next.js, the browser,
// the runner, and the verifiers, so all of them find the same workspace from
// its scope alone, with no id in the URL.
//
// A workspace is named by its scope:
//
//   compiler/<course>   /<course>, the compiler's own files (Explorer and
//                       Terminal)
//   playground          /playground, the one playground
//
// Both are folders on this computer. The playground has no course, so
// "playground" stands in for one wherever a workspace names its owner (its
// template is content/workspaces/playground/blank).
// The id is "w" and the first 10 characters of the lowercase base32 of
// SHA-256(scope), safe as a folder name and in a tmux session's name. Plain
// JavaScript with its own SHA-256, so it works the same, and synchronously,
// in the browser, in Next.js, and in the runner.

export const WORKSPACE_ID = /^w[a-z2-7]{10}$/;

const COURSE = /^[a-z][a-z0-9-]{0,31}$/;

/** The workspace id of a scope, like "wk3j6q2m7xa". */
export function workspaceId(scope) {
  if (!isScope(scope)) throw new Error(`Not a workspace scope: ${scope}`);
  return `w${base32(sha256(new TextEncoder().encode(scope))).slice(0, 10)}`;
}

/** Whether a string is a well-formed scope. */
export function isScope(scope) {
  return parseScope(scope) !== null;
}

/** A scope's parts, or null when it isn't one. */
export function parseScope(scope) {
  if (typeof scope !== "string" || scope.length > 256) return null;
  if (scope === "playground") return { kind: "playground", course: "playground" };
  const s = scope.split("/");
  if (s[0] === "compiler" && s.length === 2 && COURSE.test(s[1])) return { kind: "compiler", course: s[1] };
  return null;
}

/** Lowercase RFC 4648 base32, no padding. */
export function base32(bytes) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of some bytes (FIPS 180-4), as 32 bytes. Scopes are short, so speed doesn't matter. */
export function sha256(bytes) {
  const length = bytes.length;
  const blocks = Math.ceil((length + 9) / 64);
  const msg = new Uint8Array(blocks * 64);
  msg.set(bytes);
  msg[length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(msg.length - 4, (length << 3) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += bb;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}
