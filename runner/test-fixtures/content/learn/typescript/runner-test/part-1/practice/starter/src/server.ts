// A small HTTP server for the runner's tests: it listens on the port the
// workspace leased (PORT), greets with src/greet.ts, and says bye when it
// gets SIGTERM, so a check can watch it shut down gracefully.
import { createServer } from "node:http";
import { greet } from "./greet.ts";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else if (url.pathname === "/hello") {
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "seen=1; Path=/; HttpOnly" });
    res.end(JSON.stringify({ greeting: greet(url.searchParams.get("name") ?? "you"), seen: req.headers.cookie ?? null }));
  } else if (url.pathname === "/framed") {
    res.writeHead(200, { "content-type": "text/html", "x-frame-options": "DENY" });
    res.end("<p>no frames</p>");
  } else {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  }
});

server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
  console.log(`Listening on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  console.log("bye");
  server.close(() => process.exit(0));
});
