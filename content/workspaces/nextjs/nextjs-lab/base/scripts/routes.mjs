// Prints the app's routes, as the running dev server sees them, one per line.
// It asks the dev server's built-in MCP endpoint (/_next/mcp) to run get_routes,
// so start the dev server first: npm run dev.

const port = process.env.PORT ?? "3000";
const endpoint = `http://localhost:${port}/_next/mcp`;

async function callTool(name, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) {
    throw new Error(`${endpoint} answered ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const isStream = response.headers.get("content-type")?.includes("text/event-stream");
  const payload = isStream
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("")
    : text;
  const message = JSON.parse(payload);
  if (message.error) {
    throw new Error(message.error.message);
  }
  return JSON.parse(message.result.content[0].text);
}

try {
  const { appRouter = [], error } = await callTool("get_routes", { routerType: "app" });
  if (error) {
    throw new Error(error);
  }
  for (const route of appRouter) {
    console.log(route);
  }
} catch (error) {
  if (error.cause?.code === "ECONNREFUSED") {
    console.error(`No dev server is listening on port ${port}. Start it with npm run dev, then run npm run routes again.`);
    process.exit(1);
  }
  console.error(`Could not read the routes: ${error.message}`);
  process.exit(1);
}
