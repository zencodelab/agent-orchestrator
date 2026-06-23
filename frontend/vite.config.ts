import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// During `vite dev`, /api is proxied to the backend so the browser can use
// same-origin relative URLs (no CORS, no rebuild to point at a different host).
// `base` defaults to "/"; the GitHub Pages build sets VITE_BASE=/agent-orchestrator/.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
