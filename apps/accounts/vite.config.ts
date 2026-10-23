import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the sign-in / account / admin pages. The Worker in src/worker serves
// them as static assets and handles /api/*.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
