import { defineConfig } from "astro/config";

// Static pages served by Cloudflare Pages. Tickets, orders, payments, the admin
// and the door scanner talk to Pages Functions in ./functions backed by D1.
export default defineConfig({
  site: "https://deaddreamsbooking.com",
  trailingSlash: "ignore",
  build: { format: "directory" },
});
