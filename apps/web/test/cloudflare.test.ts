import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("Cloudflare Pages deployment", () => {
  it("deploys the static Astro output from the workspace root", () => {
    const configSource = readFileSync(
      resolve(workspaceRoot, "wrangler.jsonc"),
      "utf8",
    );
    const config = JSON.parse(
      configSource.replace(/,\s*([}\]])/g, "$1"),
    ) as Record<string, unknown>;

    expect(config).toMatchObject({
      name: "curltocode",
      pages_build_output_dir: "./apps/web/dist",
      compatibility_date: "2026-08-12",
      send_metrics: false,
    });
  });

  it("ships Cloudflare security and immutable asset headers", () => {
    const headers = readFileSync(
      resolve(workspaceRoot, "apps/web/public/_headers"),
      "utf8",
    );

    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
    expect(headers).toContain("/_astro/*");
    expect(headers).toContain("max-age=31536000, immutable");
  });
});
