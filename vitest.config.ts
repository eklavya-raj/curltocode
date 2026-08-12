import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "apps/web/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["apps/web/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: [
        "packages/core/src/**/*.ts",
        "packages/generators/src/**/*.ts",
        "packages/curltocode/src/**/*.ts",
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 65,
      },
    },
  },
});
