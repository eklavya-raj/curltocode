/**
 * Canonical site identity. This must stay in sync with `site` in astro.config.ts.
 */
export const SITE_URL = "https://curltocode.com";
export const SITE_NAME = "CurlToCode";
export const SITE_LOCALE = "en_US";
export const SITE_LANGUAGE = "en";

/** Published contact address. Legal pages and the contact page share it. */
export const CONTACT_EMAIL = "hello@curltocode.com";

export const SITE_DESCRIPTION =
  "Convert cURL commands to code and code back to cURL. Every conversion runs locally in your browser.";

/** Resolve a site-relative path to an absolute URL for metadata and JSON-LD. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/**
 * Normalize a pathname to the canonical form implied by `trailingSlash: "never"`.
 * Astro reports the home page as "/", which must stay "/" to remain a valid URL.
 */
export function canonicalPath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}
