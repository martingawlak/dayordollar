import { defineConfig } from "astro/config";

// Static build served by Cloudflare Pages. Server-side bits (checkout, contact,
// sign-in) live in ./functions as Pages Functions.
export default defineConfig({
  site: "https://martingawlakcompany.com",
  trailingSlash: "ignore",
  build: { format: "directory" },
});
