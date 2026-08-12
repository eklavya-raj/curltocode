import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4323", trace: "on-first-retry" },
  webServer: [
    {
      // Exercise Vite's development transforms and React Fast Refresh. A production
      // build alone cannot detect integration mismatches in this pipeline.
      command: "pnpm --filter @curltocode/web dev --host 127.0.0.1 --port 4323",
      url: "http://127.0.0.1:4323",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Keep sitemap and static-output assertions tied to the deployable build.
      command:
        "pnpm build && pnpm --filter @curltocode/web preview --host 127.0.0.1 --port 4324",
      url: "http://127.0.0.1:4324",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
