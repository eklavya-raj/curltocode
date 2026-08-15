import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const viteCacheScope = ["dev", "build", "check"].find((command) =>
  process.argv.includes(command),
);

export default defineConfig({
  site: "https://curltocode.com",
  output: "static",
  trailingSlash: "never",
  integrations: [
    react(),
    sitemap({
      // The 404 route is noindex, so it must not appear as a canonical URL.
      filter: (page) => !page.includes("/404"),
      // No `lastmod`, `changefreq`, or `priority`. Google ignores the latter
      // two outright, and a build-time `lastmod` would claim every page
      // changed on every deploy. Google documents that it stops trusting
      // `lastmod` values it finds unreliable, so an inaccurate one is worse
      // than none.
    }),
  ],
  vite: {
    // Astro's build and development transforms use different React runtimes.
    // Separate caches prevent concurrent Playwright servers—or a build followed
    // by `pnpm dev`—from reusing production JSX in the development server.
    cacheDir: `node_modules/.vite-${viteCacheScope ?? "tooling"}`,
    plugins: [tailwindcss()],
  },
});
