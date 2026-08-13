import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "go",
  "php",
  "java",
  "csharp",
  "ruby",
  "rust",
] as const;

const CLIENTS = [
  "fetch",
  "axios",
  "undici",
  "requests",
  "httpx",
  "aiohttp",
  "nethttp",
  "resty",
  "curl",
  "guzzle",
  "httpclient",
  "okhttp",
  "apache",
  "restsharp",
  "faraday",
  "reqwest",
  "ureq",
] as const;

/**
 * Converter pages. Frontmatter is validated at build time so a page cannot ship
 * without the metadata the SEO layout and structured data depend on.
 */
const converters = defineCollection({
  loader: glob({ base: "./src/content/converters", pattern: "**/*.md" }),
  schema: z.object({
    direction: z.enum(["curl-to-code", "code-to-curl"]).default("curl-to-code"),
    /** Route path, without a leading slash. */
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9-]+)?$/u),
    title: z.string().min(20).max(65),
    description: z.string().min(80).max(165),
    heading: z.string().min(5),
    eyebrow: z.string().min(3),
    lede: z.string().min(40),
    language: z.enum(LANGUAGES),
    client: z.enum(CLIENTS),
    /** Display names used in prose and breadcrumbs. */
    languageLabel: z.string().min(1),
    clientLabel: z.string().min(1),
    /** Parent language hub slug, for nested client pages. */
    parent: z.string().optional(),
    order: z.number().int().nonnegative(),
    faqs: z
      .array(
        z.object({ question: z.string().min(10), answer: z.string().min(40) }),
      )
      .min(2),
    related: z.array(z.string()).min(2),
  }),
});

export const collections = { converters };
