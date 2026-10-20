// A PostgreSQL client in one function, for the tests only: a single-file
// program on hu/node has no driver, so this speaks the wire protocol itself
// (startup, SCRAM-SHA-256, one simple query) and answers the rows as text.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import net from "node:net";

export async function pgQuery(url, sql) {
  const u = new URL(url);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const sock = net.connect({ host: u.hostname, port: Number(u.port || 5432) });
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("error", reject);
  });
  let buf = Buffer.alloc(0);
  const messages = [];
  let wake = null;
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 5 && buf.length >= 1 + buf.readInt32BE(1)) {
      const len = buf.readInt32BE(1);
      messages.push({ type: String.fromCharCode(buf[0]), body: buf.subarray(5, 1 + len) });
      buf = buf.subarray(1 + len);
    }
    if (wake && messages.length) (wake(), (wake = null));
  });
  const next = async () => {
    while (!messages.length) await new Promise((r) => (wake = r));
    return messages.shift();
  };
  const send = (type, body) => {
    const head = Buffer.alloc(type ? 5 : 4);
    if (type) head.write(type, 0);
    head.writeInt32BE(body.length + 4, type ? 1 : 0);
    sock.write(Buffer.concat([head, body]));
  };
  const fail = (body) => {
    const fields = body.toString("utf8").split("\0");
    return new Error(fields.find((f) => f.startsWith("M"))?.slice(1) ?? "error");
  };
  const params = Buffer.from(`user\0${user}\0database\0${u.pathname.slice(1)}\0\0`);
  const version = Buffer.alloc(4);
  version.writeInt32BE(196608, 0);
  send("", Buffer.concat([version, params]));
  const nonce = randomBytes(18).toString("base64");
  const first = `n=,r=${nonce}`;
  for (;;) {
    const m = await next();
    if (m.type === "E") throw fail(m.body);
    if (m.type === "Z") break;
    if (m.type !== "R") continue;
    const code = m.body.readInt32BE(0);
    if (code === 10) {
      const mech = Buffer.from("SCRAM-SHA-256\0");
      const data = Buffer.from(`n,,${first}`);
      const len = Buffer.alloc(4);
      len.writeInt32BE(data.length, 0);
      send("p", Buffer.concat([mech, len, data]));
    } else if (code === 11) {
      const serverFirst = m.body.subarray(4).toString();
      const attrs = Object.fromEntries(serverFirst.split(",").map((kv) => [kv[0], kv.slice(2)]));
      const salted = pbkdf2Sync(password, Buffer.from(attrs.s, "base64"), Number(attrs.i), 32, "sha256");
      const clientKey = createHmac("sha256", salted).update("Client Key").digest();
      const storedKey = createHash("sha256").update(clientKey).digest();
      const final = `c=biws,r=${attrs.r}`;
      const signature = createHmac("sha256", storedKey).update(`${first},${serverFirst},${final}`).digest();
      const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i])).toString("base64");
      send("p", Buffer.from(`${final},p=${proof}`));
    } else if (code !== 0 && code !== 12) {
      throw new Error(`unsupported authentication ${code}`);
    }
  }
  send("Q", Buffer.from(`${sql}\0`));
  const rows = [];
  let error = null;
  for (;;) {
    const m = await next();
    if (m.type === "E") error = fail(m.body);
    if (m.type === "D") {
      const row = [];
      let at = 2;
      for (let i = 0; i < m.body.readInt16BE(0); i++) {
        const len = m.body.readInt32BE(at);
        at += 4;
        row.push(len < 0 ? null : m.body.subarray(at, at + len).toString());
        at += Math.max(len, 0);
      }
      rows.push(row);
    }
    if (m.type === "Z") break;
  }
  send("X", Buffer.alloc(0));
  sock.end();
  if (error) throw error;
  return rows;
}
