// Vite serves the page while you work (npm run dev) and bundles it for production
// (npm run build). The workspace gives the server its port in PORT.
import { defineConfig } from "vite";

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  // Vite's own cache lives here instead of node_modules/.vite, so it also works
  // when node_modules is shared and read-only.
  cacheDir: ".vite-cache",
  server: {
    // 0.0.0.0 listens on every network interface, not only on loopback, so the
    // server can be reached from outside its container.
    host: "0.0.0.0",
    port,
    // Stop with an error instead of quietly moving to a port nobody is watching.
    strictPort: true,
  },
  // npm run preview serves the built dist/ folder on the same port.
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: true,
  },
});
