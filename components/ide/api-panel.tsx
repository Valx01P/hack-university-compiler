"use client";

import { useEffect, useMemo, useState } from "react";
import { asCurl, parseHttpFile, resolveVariables, targetOf, type HttpFileRequest, type NamedResponse } from "@/lib/http-file";
import { workspaceApi, WorkspaceError, type HttpResponse } from "@/lib/workspace-client";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The API panel (architecture §8.3): send HTTP requests to the workspace's
 * servers. It lists the requests in the workspace's .http files (REST
 * Client syntax, lib/http-file.ts), so pressing Send on one reproduces it,
 * and takes ad-hoc ones: method, path, headers, a body, and a Bearer helper.
 * Requests go through the runner (POST .../http) to this workspace's ports
 * only, with a cookie jar per workspace that follows login flows, so CORS
 * never gets in the way. The response shows its status, time, size,
 * headers, cookies, and the body (pretty JSON), with Copy as curl.
 */

interface Draft {
  method: string;
  path: string;
  headers: string;
  body: string;
  name: string | null;
}

const EMPTY: Draft = { method: "GET", path: "/", headers: "", body: "", name: null };

function headerLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([^:\s]+)\s*:\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function ApiPanel({ store }: { store: WorkspaceStore }) {
  useStore(store, "ports", "tree");
  const ports = [...store.ports.keys()].sort((a, b) => a - b);
  const [port, setPort] = useState<number | null>(null);
  const usePort = port !== null && store.ports.has(port) ? port : (ports[0] ?? null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [bearer, setBearer] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<(Omit<HttpResponse, "headers"> & { headers: Record<string, string>; url: string; curl: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ path: string; requests: HttpFileRequest[]; variables: Record<string, string> }[]>([]);
  const [named, setNamed] = useState<Record<string, NamedResponse>>({});

  // The .http files in the workspace, the template's own first.
  const httpPaths = useMemo(() => {
    const all = [...store.nodes.values()].filter((n) => n.type === "file" && /\.(http|rest)$/.test(n.name)).map((n) => n.path);
    const first = store.props.template.requests;
    return first && all.includes(first) ? [first, ...all.filter((p) => p !== first)] : all;
    // The tree slice re-renders this when files come and go.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.version("tree")]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      httpPaths.map(async (path) => {
        try {
          const read = await workspaceApi.readFile(store.id, path);
          if (read.kind !== "text") return null;
          const parsed = parseHttpFile(read.text);
          return { path, ...parsed };
        } catch {
          return null;
        }
      })
    ).then((list) => {
      if (!cancelled) setFiles(list.filter((f): f is NonNullable<typeof f> => f !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [httpPaths, store.id]);

  function load(file: (typeof files)[number], req: HttpFileRequest) {
    const vars = file.variables;
    const url = resolveVariables(req.url, vars, named, usePort);
    const target = targetOf(url, usePort);
    if (target.port && store.ports.has(target.port)) setPort(target.port);
    setDraft({
      method: req.method,
      path: target.path,
      headers: req.headers.map(([k, v]) => `${k}: ${resolveVariables(v, vars, named, usePort)}`).join("\n"),
      body: resolveVariables(req.body, vars, named, usePort),
      name: req.name,
    });
    setResponse(null);
    setError(null);
  }

  async function send() {
    if (usePort === null) return setError("Nothing is listening yet. Start the server first (Run), then send.");
    setBusy(true);
    setError(null);
    const headers = headerLines(draft.headers);
    if (bearer.trim()) headers.Authorization = `Bearer ${bearer.trim()}`;
    if (draft.body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      try {
        JSON.parse(draft.body);
        headers["Content-Type"] = "application/json";
      } catch {
        /* not JSON: sent as it is */
      }
    }
    const path = draft.path.startsWith("/") ? draft.path : `/${draft.path}`;
    const url = `http://${window.location.hostname}:${usePort}${path}`;
    try {
      const res = await workspaceApi.http(store.id, {
        port: usePort,
        method: draft.method,
        path,
        headers,
        ...(draft.body && draft.method !== "GET" && draft.method !== "HEAD" ? { body: draft.body } : {}),
        jar: true,
      });
      // Repeated headers come joined, and set-cookie as a list.
      const flat = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]));
      setResponse({ ...res, headers: flat, url, curl: asCurl(draft.method, url, headers, draft.body || undefined) });
      if (draft.name) setNamed((n) => ({ ...n, [draft.name!]: { status: res.status, headers: flat, body: res.body } }));
    } catch (err) {
      setError(err instanceof WorkspaceError ? err.message : "The request didn't go through.");
      setResponse(null);
    } finally {
      setBusy(false);
    }
  }

  let pretty = response?.body ?? "";
  const json = response && /json/i.test(Object.entries(response.headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "");
  if (json) {
    try {
      pretty = JSON.stringify(JSON.parse(response!.body), null, 2);
    } catch {
      /* as it came */
    }
  }
  const field = "field rounded-btn px-2 py-1 text-base sm:text-xs";

  return (
    <div className="flex h-full min-h-0 text-xs">
      {files.some((f) => f.requests.length) && (
        <nav aria-label="Requests in .http files" className="slim-scroll w-56 shrink-0 overflow-auto border-r border-line py-1">
          {files.map((file) => (
            <div key={file.path}>
              <p className="truncate px-3 pt-1.5 pb-0.5 font-mono text-[11px] text-ink-faint" title={file.path}>
                {file.path}
              </p>
              {file.requests.map((req, i) => (
                <button
                  key={`${req.line}-${i}`}
                  type="button"
                  onClick={() => load(file, req)}
                  title={`${req.method} ${req.url}`}
                  className="flex w-full items-baseline gap-2 px-3 py-1 text-left text-ink-muted hover:bg-highlight hover:text-ink"
                >
                  <span className="w-11 shrink-0 font-mono text-[11px] font-semibold text-ink">{req.method}</span>
                  <span className="min-w-0 truncate">{req.title}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}
      <div className="slim-scroll flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex flex-wrap items-center gap-1.5"
        >
          <label className="sr-only" htmlFor={`${store.id}-api-port`}>
            Port
          </label>
          <select id={`${store.id}-api-port`} value={usePort ?? ""} onChange={(e) => setPort(Number(e.target.value))} className={`${field} w-24`} disabled={!ports.length}>
            {ports.length ? ports.map((p) => <option key={p} value={p}>{`:${p}`}</option>) : <option value="">no port</option>}
          </select>
          <label className="sr-only" htmlFor={`${store.id}-api-method`}>
            Method
          </label>
          <select id={`${store.id}-api-method`} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} className={`${field} w-24 font-mono`}>
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            aria-label="Path"
            value={draft.path}
            onChange={(e) => setDraft({ ...draft, path: e.target.value })}
            spellCheck={false}
            className={`${field} min-w-40 flex-1 font-mono`}
            placeholder="/path?query"
          />
          <button type="submit" disabled={busy} className="rounded-btn border border-edge-strong px-4 py-1 text-xs font-medium btn-grad disabled:opacity-50">
            Send
          </button>
        </form>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-ink-faint">
            Headers (one per line)
            <textarea
              value={draft.headers}
              onChange={(e) => setDraft({ ...draft, headers: e.target.value })}
              rows={3}
              spellCheck={false}
              className={`${field} resize-y font-mono`}
              placeholder="Content-Type: application/json"
            />
          </label>
          <label className="flex flex-col gap-1 text-ink-faint">
            Body
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={3}
              spellCheck={false}
              className={`${field} resize-y font-mono`}
              placeholder='{"title": "Write tests"}'
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-ink-faint">
          Bearer token
          <input value={bearer} onChange={(e) => setBearer(e.target.value)} spellCheck={false} className={`${field} min-w-0 flex-1 font-mono`} placeholder="adds Authorization: Bearer …" />
        </label>
        {error && (
          <p role="alert" className="rounded-btn border border-line-strong px-3 py-2 text-ink">
            {error}
          </p>
        )}
        {response && (
          <div className="flex min-h-0 flex-col gap-1.5" role="status">
            <p className="flex flex-wrap items-center gap-3 font-mono">
              <span className="font-semibold text-ink">
                {response.status} {response.statusText}
              </span>
              {response.timingMs !== undefined && <span className="text-ink-faint">{response.timingMs} ms</span>}
              <span className="text-ink-faint">{response.size ?? response.body.length} bytes</span>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(response.curl)} className="ms-auto rounded-btn px-2 py-0.5 text-ink-muted hover:bg-highlight hover:text-ink">
                Copy as curl
              </button>
              {response.cookies && response.cookies.length > 0 && (
                <button
                  type="button"
                  onClick={() => void workspaceApi.clearCookies(store.id).then(() => store.announce("Cleared the API panel's cookies"))}
                  className="rounded-btn px-2 py-0.5 text-ink-muted hover:bg-highlight hover:text-ink"
                >
                  Clear cookies
                </button>
              )}
            </p>
            <details>
              <summary className="cursor-pointer text-ink-faint">Headers ({Object.keys(response.headers).length})</summary>
              <pre className="code-dark slim-scroll mt-1 max-h-32 overflow-auto rounded-btn border border-code-content-line bg-code-bg px-3 py-2 font-mono text-code-ink">
                {Object.entries(response.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              </pre>
            </details>
            {response.cookies && response.cookies.length > 0 && (
              <p className="text-ink-faint">
                Cookies kept for later requests: <span className="font-mono text-ink-muted">{response.cookies.map((c) => c.name).join(", ")}</span>
              </p>
            )}
            <pre className="code-dark slim-scroll max-h-72 min-h-16 overflow-auto rounded-btn border border-code-content-line bg-code-bg px-3 py-2 font-mono text-code-ink">
              {response.bodyEncoding === "base64" ? `(${response.size ?? 0} bytes of binary data)` : pretty || "(empty body)"}
            </pre>
            {response.truncated && <p className="text-ink-faint">The body is over 1 MB, so only its start shows.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
