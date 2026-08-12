import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite blocks unrecognized Host headers by default (DNS-rebinding protection).
    // Add your tunnel domain(s) here when exposing the dev server publicly, e.g.
    // via ngrok. Use true to allow any host (fine for short-lived demo tunnels,
    // not recommended left on for anything long-running).
    allowedHosts: [".ngrok-free.app", ".ngrok.io"],
    proxy: {
      // Use 127.0.0.1 instead of localhost: on Windows, Node's proxy resolves
      // "localhost" to ::1 (IPv6) first, but Flask's dev server only listens on
      // IPv4 (127.0.0.1) by default — that mismatch causes ECONNREFUSED / silent
      // proxy failures even though the backend is actually up and reachable.
      "/api": "http://127.0.0.1:5000",
      "/static": "http://127.0.0.1:5000",
    },
  },
});
