import http from "node:http";
import net from "node:net";
import { Duplex } from "node:stream";
import type Docker from "dockerode";
import { execStream } from "./exec.ts";
import { Demux } from "./jobs.ts";
import type { Log } from "./log.ts";

/**
 * The port bridge (architecture §4.2.6, measured as J4): no container
 * publishes a port. While a workspace runs, the runner listens on each of its
 * ports on 127.0.0.1 and ::1, and pipes every connection into the container
 * with `docker exec … socat STDIO TCP:127.0.0.1:<port>` as uid 1000, TTY off,
 * stripping Docker's 8-byte stream headers. That reaches a server bound to
 * 0.0.0.0 or 127.0.0.1 inside, even with network none.
 *
 * Before piping, it reads the request head (at most 16 KiB) and refuses a
 * Host that isn't localhost, 127.0.0.1, or [::1] with that port (DNS
 * rebinding), answers /__hu/clear-site-data itself, and answers a small 503
 * page while nothing listens. The API panel and the framing probe use the
 * same exec stream as an HTTP client's socket, with no port on the Mac.
 */

const HEAD_MAX = 16 * 1024;
/** A client that says nothing this long speaks a protocol where the server talks first. */
const QUIET_MS = 300;

/** An exec'd socat as a socket: stdout comes out, stderr is dropped, writes go to stdin. */
export class ExecSocket extends Duplex {
  private readonly raw: Duplex;
  /** Bytes the container sent so far. */
  received = 0;

  constructor(raw: Duplex) {
    super({ allowHalfOpen: true });
    this.raw = raw;
    const demux = new Demux((type, data) => {
      if (type !== 1) return;
      this.received += data.length;
      if (!this.push(data)) raw.pause();
    });
    raw.on("data", (chunk: Buffer) => demux.push(chunk));
    raw.on("end", () => this.push(null));
    raw.on("close", () => {
      this.push(null);
      this.destroy();
    });
    raw.on("error", (err) => this.destroy(err));
  }

  override _read() {
    this.raw.resume();
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.raw.write(chunk, callback);
  }

  override _final(callback: (error?: Error | null) => void) {
    this.raw.end();
    callback();
  }

  override _destroy(err: Error | null, callback: (error: Error | null) => void) {
    this.raw.destroy();
    callback(err);
  }

  // What node:http may call on a socket.
  setTimeout() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
}

/** Opens a connection to `port` inside the container. */
export async function openTunnel(container: Docker.Container, port: number): Promise<ExecSocket> {
  const { stream } = await execStream(container, ["socat", "-T600", "STDIO", `TCP:127.0.0.1:${port}`], { user: "learner" });
  return new ExecSocket(stream);
}

export interface BridgeOptions {
  /** The port on the Mac. */
  port: number;
  /** The port inside the container (the same number unless a detected port had to move). */
  target: number;
  container: Docker.Container;
  /** Whether something listens on the target right now (from the poll). */
  listening: () => boolean;
  /** Whether another connection fits the workspace's 64. */
  admit: () => boolean;
  release: () => void;
  /** The IDE loaded /__hu/clear-site-data. */
  onCleared: () => void;
  log: Log;
}

/** The listeners for one port: 127.0.0.1 and ::1. */
export class Bridge {
  readonly port: number;
  readonly target: number;
  private readonly options: BridgeOptions;
  private readonly servers: net.Server[] = [];
  private readonly sockets = new Set<net.Socket>();

  constructor(options: BridgeOptions) {
    this.options = options;
    this.port = options.port;
    this.target = options.target;
  }

  /** Listens on 127.0.0.1 and ::1. Fails when 127.0.0.1 is taken. */
  async listen(): Promise<void> {
    for (const host of ["127.0.0.1", "::1"]) {
      const server = net.createServer({ allowHalfOpen: true, pauseOnConnect: false }, (socket) => this.accept(socket));
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen({ port: this.port, host, exclusive: true }, () => {
            server.off("error", reject);
            resolve();
          });
        });
        server.on("error", () => {});
        this.servers.push(server);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // A Mac without IPv6 loopback still works on 127.0.0.1.
        if (host === "::1" && (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT")) continue;
        this.close();
        throw err;
      }
    }
  }

  close() {
    for (const server of this.servers) server.close();
    this.servers.length = 0;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  private accept(socket: net.Socket) {
    if (!this.options.admit()) {
      socket.destroy();
      return;
    }
    this.sockets.add(socket);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.sockets.delete(socket);
      this.options.release();
    };
    socket.on("close", release);
    socket.on("error", () => socket.destroy());

    let head = Buffer.alloc(0);
    const quiet = setTimeout(() => {
      socket.off("data", onData);
      socket.pause();
      void this.pipe(socket, head, false);
    }, QUIET_MS);
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const looksHttp = /^[A-Z]{3,12} /.test(head.subarray(0, 13).toString("latin1"));
      if (!looksHttp && head.length >= 13) {
        clearTimeout(quiet);
        socket.off("data", onData);
        socket.pause();
        void this.pipe(socket, head, false);
        return;
      }
      const end = head.indexOf("\r\n\r\n");
      if (end < 0 && head.length < HEAD_MAX) return;
      clearTimeout(quiet);
      // Removing the listener doesn't pause a flowing socket: bytes would be lost.
      socket.off("data", onData);
      socket.pause();
      if (end < 0) return answer(socket, 431, "Request Header Fields Too Large", "The request head is over 16 KiB.");
      this.http(socket, head, head.subarray(0, end).toString("latin1"));
    };
    socket.on("data", onData);
  }

  private http(socket: net.Socket, head: Buffer, text: string) {
    const lines = text.split("\r\n");
    const host = lines.find((l) => /^host:/i.test(l))?.slice(5).trim().toLowerCase();
    const allowed = [`localhost:${this.port}`, `127.0.0.1:${this.port}`, `[::1]:${this.port}`];
    if (!host || !allowed.includes(host)) {
      return answer(socket, 421, "Misdirected Request", `This port answers only to localhost:${this.port}.`);
    }
    const target = lines[0].split(" ")[1] ?? "/";
    if (target === "/__hu/clear-site-data" || target.startsWith("/__hu/clear-site-data?")) {
      this.options.onCleared();
      socket.end(
        'HTTP/1.1 302 Found\r\nLocation: /\r\nClear-Site-Data: "storage"\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
      );
      return;
    }
    if (!this.options.listening()) return notListening(socket, this.target);
    void this.pipe(socket, head, true);
  }

  private async pipe(socket: net.Socket, head: Buffer, isHttp: boolean) {
    let tunnel: ExecSocket;
    try {
      tunnel = await openTunnel(this.options.container, this.options.target);
    } catch (err) {
      this.options.log.warn("bridge.open_failed", { port: this.port, error: (err as Error).message });
      if (isHttp) return notListening(socket, this.target);
      socket.destroy();
      return;
    }
    if (socket.destroyed) {
      tunnel.destroy();
      return;
    }
    tunnel.on("error", () => socket.destroy());
    tunnel.on("end", () => {
      // socat couldn't connect (nothing listens after all): say so instead of an empty reply.
      if (isHttp && tunnel.received === 0 && !socket.destroyed) return notListening(socket, this.target);
      socket.end();
    });
    tunnel.on("close", () => {
      if (!socket.destroyed && socket.writable && !(isHttp && tunnel.received === 0)) socket.end();
    });
    socket.on("close", () => tunnel.destroy());
    socket.on("end", () => tunnel.end());
    if (head.length) tunnel.write(head);
    socket.pipe(tunnel, { end: false });
    tunnel.pipe(socket, { end: false });
  }
}

function answer(socket: net.Socket, status: number, reason: string, message: string) {
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n${body}`
  );
}

function notListening(socket: net.Socket, port: number) {
  const body = `<!doctype html><meta charset="utf-8"><title>Nothing here yet</title><body style="font:15px system-ui;margin:2rem;color:#555">Nothing is listening on port ${port} in this workspace yet. Press Run.</body>\n`;
  socket.end(
    `HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nCache-Control: no-store\r\nRetry-After: 1\r\nConnection: close\r\n\r\n${body}`
  );
}

export interface HttpExchange {
  status: number;
  statusText: string;
  /** Lowercase names: one string each, except set-cookie, which is an array. */
  headers: Record<string, string | string[]>;
  body: Buffer;
  truncated: boolean;
  timingMs: number;
}

export class HttpThroughError extends Error {
  readonly code: "not_listening" | "timeout";
  constructor(code: "not_listening" | "timeout", message: string) {
    super(message);
    this.code = code;
  }
}

/** One HTTP request to a port inside a container, through an exec'd socat. */
export function requestThrough(
  container: Docker.Container,
  port: number,
  req: { method: string; path: string; headers?: Record<string, string>; body?: Buffer; host?: string; timeoutMs?: number; maxBytes?: number }
): Promise<HttpExchange> {
  const started = Date.now();
  const maxBytes = req.maxBytes ?? 1024 * 1024;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, value?: HttpExchange) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };
    const headers: Record<string, string> = { host: req.host ?? `localhost:${port}`, ...(req.headers ?? {}) };
    if (req.body?.length) headers["content-length"] = String(req.body.length);
    let tunnel: ExecSocket | null = null;
    const request = http.request({
      method: req.method,
      path: req.path,
      headers,
      // No agent: with agent false, node:http makes its own and ignores createConnection.
      createConnection: (_options: unknown, callback: (err: Error | null, socket?: Duplex) => void) => {
        openTunnel(container, port).then(
          (socket) => {
            tunnel = socket;
            callback(null, socket);
          },
          (err: Error) => callback(err)
        );
        return undefined;
      },
    } as http.RequestOptions);
    const timer = setTimeout(() => {
      request.destroy();
      finish(new HttpThroughError("timeout", `No answer within ${Math.round((req.timeoutMs ?? 30_000) / 1000)} s.`));
    }, req.timeoutMs ?? 30_000);
    request.on("response", (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on("data", (chunk: Buffer) => {
        if (size < maxBytes) chunks.push(chunk.subarray(0, maxBytes - size));
        size += chunk.length;
        if (size > maxBytes && !truncated) {
          truncated = true;
          res.destroy();
          done();
        }
      });
      const done = () => {
        const out: Record<string, string | string[]> = {};
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          const name = res.rawHeaders[i].toLowerCase();
          const value = res.rawHeaders[i + 1];
          if (name === "set-cookie") out[name] = [...((out[name] as string[]) ?? []), value];
          else out[name] = out[name] ? `${out[name]}, ${value}` : value;
        }
        finish(null, {
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? "",
          headers: out,
          body: Buffer.concat(chunks),
          truncated,
          timingMs: Date.now() - started,
        });
      };
      res.on("end", done);
      res.on("error", () => (truncated ? done() : finish(new HttpThroughError("not_listening", "The connection closed before the answer ended."))));
    });
    request.on("error", () => {
      const nothing = !tunnel || (tunnel as ExecSocket).received === 0;
      finish(new HttpThroughError("not_listening", nothing ? `Nothing is listening on port ${port}.` : "The connection closed before the answer ended."));
    });
    request.end(req.body);
  });
}

/** Whether a page may be framed by the app, from its X-Frame-Options and CSP frame-ancestors. */
export function framing(headers: Record<string, string | string[]>, appOrigins: string[]): { framable: boolean; reason: string | null } {
  const xfo = String(headers["x-frame-options"] ?? "").trim();
  if (xfo) return { framable: false, reason: `X-Frame-Options: ${xfo}` };
  const csp = String(headers["content-security-policy"] ?? "");
  const directive = csp
    .split(/[;,]/)
    .map((d) => d.trim())
    .find((d) => /^frame-ancestors(\s|$)/i.test(d));
  if (!directive) return { framable: true, reason: null };
  const sources = directive.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  const ok = sources.includes("*") || sources.some((s) => appOrigins.includes(s) || s === "http:" || s === "http://localhost:*" || s === "http://127.0.0.1:*");
  return ok ? { framable: true, reason: null } : { framable: false, reason: `Content-Security-Policy: ${directive}` };
}
