import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("Cloudflare Workers Static Assets deployment", () => {
  it("deploys the static Astro output without workspace auto-detection", () => {
    const configSource = readFileSync(
      resolve(workspaceRoot, "wrangler.jsonc"),
      "utf8",
    );
    const config = JSON.parse(
      configSource.replace(/,\s*([}\]])/g, "$1"),
    ) as Record<string, unknown>;

    expect(config).toMatchObject({
      name: "curltocode",
      compatibility_date: "2026-08-12",
      assets: {
        directory: "./apps/web/dist",
        not_found_handling: "404-page",
        html_handling: "drop-trailing-slash",
      },
      observability: { enabled: false },
      send_metrics: false,
    });
    expect(config).not.toHaveProperty("pages_build_output_dir");
  });

  it("ships Cloudflare security and immutable asset headers", () => {
    const headers = readFileSync(
      resolve(workspaceRoot, "apps/web/public/_headers"),
      "utf8",
    );

    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
    expect(headers).toContain("/_astro/*");
    expect(headers).toContain("max-age=31536000, immutable");
  });

  it("publishes a standards-compatible robots policy and canonical sitemap", () => {
    const robots = readFileSync(
      resolve(workspaceRoot, "apps/web/public/robots.txt"),
      "utf8",
    );

    expect(robots).toBe(
      "User-agent: *\nDisallow:\n\nSitemap: https://curltocode.com/sitemap-index.xml\n",
    );
  });

  it("publishes an accurate machine-readable site guide", () => {
    const llms = readFileSync(
      resolve(workspaceRoot, "apps/web/public/llms.txt"),
      "utf8",
    );

    expect(llms).toContain("# CurlToCode");
    expect(llms).toContain("entirely client-side");
    expect(llms).toContain("https://curltocode.com/converters");
    expect(llms).not.toContain("API key");
  });
});
