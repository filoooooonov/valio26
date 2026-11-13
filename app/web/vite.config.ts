import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is proxied to the gateway (app/server) so the console never hardcodes its URL.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
});
