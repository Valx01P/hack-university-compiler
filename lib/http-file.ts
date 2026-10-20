/**
 * Requests in .http files, in REST Client syntax (VS Code's REST Client and
 * JetBrains' HTTP client read the same files), for the API panel:
 *
 *   @host = http://localhost:{{$dotenv PORT}}
 *
 *   ### Log in
 *   # @name login
 *   POST {{host}}/v1/auth/login
 *   Content-Type: application/json
 *
 *   {"email": "ada@example.com", "password": "correct horse battery staple"}
 *
 *   ### Who am I
 *   GET {{host}}/v1/me
 *   Authorization: Bearer {{login.response.body.$.token}}
 *
 * Requests are separated by ### lines, `@name = value` lines define file
 * variables, `# @name` names a request so later ones can use its response
 * ({{login.response.body.$.token}}, {{login.response.headers.Location}}),
 * and {{$dotenv PORT}} or {{$processEnv PORT}} is the workspace's port.
 */

export interface HttpFileRequest {
  /** The ### line's title, or the request line. */
  title: string;
  name: string | null;
  method: string;
  /** The URL as written, variables and all. */
  url: string;
  headers: [string, string][];
  body: string;
  /** The line the request starts on (1-based), for the editor. */
  line: number;
}

export interface ParsedHttpFile {
  variables: Record<string, string>;
  requests: HttpFileRequest[];
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function parseHttpFile(text: string): ParsedHttpFile {
  const lines = text.split(/\r?\n/);
  const variables: Record<string, string> = {};
  const requests: HttpFileRequest[] = [];
  let i = 0;
  while (i < lines.length) {
    // One block: from here to the next ### line.
    let title = "";
    if (/^###/.test(lines[i])) {
      title = lines[i].replace(/^###\s*/, "").trim();
      i++;
    }
    let name: string | null = null;
    let requestLine = -1;
    for (; i < lines.length && !/^###/.test(lines[i]); i++) {
      const line = lines[i].trim();
      const variable = /^@([A-Za-z_][\w-]*)\s*=\s*(.*)$/.exec(line);
      if (variable) {
        variables[variable[1]] = variable[2].trim();
        continue;
      }
      const named = /^(?:#|\/\/)\s*@name\s+([A-Za-z_][\w-]*)/.exec(line);
      if (named) {
        name = named[1];
        continue;
      }
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      requestLine = i;
      break;
    }
    if (requestLine < 0) continue;
    const first = lines[requestLine].trim();
    const parts = first.split(/\s+/);
    const method = METHODS.includes(parts[0]?.toUpperCase()) ? parts[0].toUpperCase() : "GET";
    const url = (METHODS.includes(parts[0]?.toUpperCase()) ? parts[1] : parts[0]) ?? "/";
    const headers: [string, string][] = [];
    i = requestLine + 1;
    for (; i < lines.length && lines[i].trim() && !/^###/.test(lines[i]); i++) {
      const h = /^([^:\s]+)\s*:\s*(.*)$/.exec(lines[i].trim());
      if (h) headers.push([h[1], h[2]]);
    }
    const body: string[] = [];
    if (i < lines.length && !/^###/.test(lines[i])) i++;
    for (; i < lines.length && !/^###/.test(lines[i]); i++) body.push(lines[i]);
    while (body.length && !body[body.length - 1].trim()) body.pop();
    requests.push({ title: title || `${method} ${url}`, name, method, url, headers, body: body.join("\n"), line: requestLine + 1 });
  }
  return { variables, requests };
}

/** A value at a JSONPath-like path ($.a.b[0].c) in a parsed body. */
function jsonPath(data: unknown, path: string): unknown {
  const steps = path.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = data;
  for (const step of steps) {
    if (cur === null || cur === undefined) return undefined;
    const index = /^\[(\d+)\]$/.exec(step);
    cur = index ? (cur as unknown[])[Number(index[1])] : (cur as Record<string, unknown>)[step];
  }
  return cur;
}

export interface NamedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Fills {{variables}} in, from the file, named responses, and the port. */
export function resolveVariables(text: string, vars: Record<string, string>, responses: Record<string, NamedResponse>, port: number | null): string {
  let out = text;
  for (let round = 0; round < 5 && out.includes("{{"); round++) {
    out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (whole, expr: string) => {
      if (/^\$(dotenv|processEnv)\s+(PORT|HU_PORT)$/i.test(expr) || expr === "port" || expr === "PORT") return port ? String(port) : whole;
      if (Object.hasOwn(vars, expr)) return vars[expr];
      const ref = /^([A-Za-z_][\w-]*)\.response\.(body|headers)\.?(.*)$/.exec(expr);
      if (ref && responses[ref[1]]) {
        const res = responses[ref[1]];
        if (ref[2] === "headers") {
          const key = Object.keys(res.headers).find((k) => k.toLowerCase() === ref[3].toLowerCase());
          return key ? res.headers[key] : "";
        }
        if (!ref[3] || ref[3] === "*") return res.body;
        try {
          const value = jsonPath(JSON.parse(res.body), ref[3]);
          return value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
        } catch {
          return "";
        }
      }
      return whole;
    });
  }
  return out;
}

/** The port and path a resolved URL names: an absolute localhost URL keeps
    its own port, anything else is a path on the workspace's port. */
export function targetOf(url: string, fallbackPort: number | null): { port: number | null; path: string } {
  const absolute = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::(\d+))?(\/[^\s]*)?$/i.exec(url);
  if (absolute) return { port: absolute[2] ? Number(absolute[2]) : fallbackPort, path: absolute[3] ?? "/" };
  return { port: fallbackPort, path: url.startsWith("/") ? url : `/${url}` };
}

/** A request as a curl command, quoted for a POSIX shell. */
export function asCurl(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const parts = ["curl", "-i"];
  if (method !== "GET") parts.push("-X", method);
  for (const [k, v] of Object.entries(headers)) parts.push("-H", q(`${k}: ${v}`));
  if (body) parts.push("--data-raw", q(body));
  parts.push(q(url));
  return parts.join(" ");
}
