"use client";

import { useState } from "react";
import { workspaceApi } from "@/lib/workspace-client";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The Ports panel (architecture §8.3): every port a server in the workspace
 * listens on, with its URL, process, and state, and Preview, Open in new
 * tab, Copy, and Stop. A port keeps one number inside the sandbox and on
 * your Mac (§4.2.6), so the address a server prints is the one that works.
 * It notes a server bound to 127.0.0.1 (a real deployment needs 0.0.0.0)
 * and why a number changed, when it had to.
 */
export function PortsPanel({ store }: { store: WorkspaceStore }) {
  useStore(store, "ports");
  const [copied, setCopied] = useState<number | null>(null);
  const ports = [...store.ports.values()].sort((a, b) => a.port - b.port);
  const host = typeof window === "undefined" ? "localhost" : window.location.hostname;
  const btn = "rounded-btn border border-edge-strong px-2 py-0.5 text-xs font-medium text-ink transition-colors hover:bg-highlight";
  if (!ports.length) {
    return (
      <p className="p-4 text-sm text-ink-faint">
        Nothing is listening yet. Start a server (Run, or a command in the terminal) and its port shows here, with the same number in the sandbox and in your
        browser.
      </p>
    );
  }
  return (
    <div className="slim-scroll h-full overflow-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface text-ink-faint">
          <tr className="border-b border-line">
            <th className="px-3 py-1.5 font-medium">Port</th>
            <th className="px-3 py-1.5 font-medium">Address</th>
            <th className="px-3 py-1.5 font-medium">Process</th>
            <th className="px-3 py-1.5 font-medium">State</th>
            <th className="px-3 py-1.5 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ports.map((p) => {
            const url = `http://${host}:${p.port}/`;
            return (
              <tr key={p.port} className="border-b border-line align-top">
                <td className="px-3 py-1.5 font-mono text-ink">
                  {p.port}
                  {p.label && <span className="ml-1.5 font-sans text-ink-faint">{p.label}</span>}
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-mono text-ink-muted">{url}</span>
                  {p.bind === "127.0.0.1" && (
                    <p className="mt-0.5 text-ink-faint">Bound to 127.0.0.1. It works here, but a real server listens on 0.0.0.0 (--host 0.0.0.0).</p>
                  )}
                  {p.note && <p className="mt-0.5 text-ink-faint">{p.note}</p>}
                  {p.framable === false && <p className="mt-0.5 text-ink-faint">Refuses to show in a frame{p.reason ? ` (${p.reason})` : ""}: open it in a new tab.</p>}
                </td>
                <td className="px-3 py-1.5 font-mono text-ink-muted">{p.process ?? ""}</td>
                <td className="px-3 py-1.5 text-ink-muted">{p.state}</td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap justify-end gap-1">
                    <button type="button" className={btn} onClick={() => store.openPreview(p.port, "/")}>
                      Preview
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={btn}>
                      Open in new tab
                    </a>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        void navigator.clipboard?.writeText(url);
                        setCopied(p.port);
                        window.setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      {copied === p.port ? "Copied" : "Copy"}
                    </button>
                    {p.declared === false && (
                      <button
                        type="button"
                        className={btn}
                        title="Stop forwarding this port (the server keeps running in the sandbox)"
                        onClick={() => void workspaceApi.stopPort(store.id, p.port).catch(() => store.announce(`Couldn't stop forwarding ${p.port}.`))}
                      >
                        Stop
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
