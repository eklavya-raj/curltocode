import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const productionBaseUrl = "http://127.0.0.1:4324";
const indexablePages = [
  ["/", "cURL ↔ Code Converter"],
  ["/converters", "cURL and code converters"],
  ["/about", "About CurlToCode"],
  ["/contact", "Contact"],
  ["/cookies", "Cookie Policy"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/curl-to-csharp", "Convert cURL to C#"],
  ["/curl-to-csharp/httpclient", "Convert cURL to C# HttpClient"],
  ["/curl-to-csharp/restsharp", "Convert cURL to C# RestSharp"],
  ["/curl-to-go", "Convert cURL to Go"],
  ["/curl-to-go/nethttp", "Convert cURL to Go net/http"],
  ["/curl-to-go/resty", "Convert cURL to Go Resty"],
  ["/curl-to-java", "Convert cURL to Java"],
  ["/curl-to-java/apache-httpclient", "Convert cURL to Apache HttpClient 5"],
  ["/curl-to-java/httpclient", "Convert cURL to Java HttpClient"],
  ["/curl-to-java/okhttp", "Convert cURL to Java OkHttp"],
  ["/curl-to-javascript", "Convert cURL to JavaScript"],
  ["/curl-to-javascript/axios", "Convert cURL to Axios"],
  ["/curl-to-javascript/fetch", "Convert cURL to Fetch"],
  ["/curl-to-javascript/undici", "Convert cURL to JavaScript Undici"],
  ["/curl-to-php", "Convert cURL to PHP"],
  ["/curl-to-php/curl", "Convert cURL to PHP cURL"],
  ["/curl-to-php/guzzle", "Convert cURL to PHP Guzzle"],
  ["/curl-to-python", "Convert cURL to Python"],
  ["/curl-to-python/aiohttp", "Convert cURL to Python aiohttp"],
  ["/curl-to-python/httpx", "Convert cURL to Python HTTPX"],
  ["/curl-to-python/requests", "Convert cURL to Python Requests"],
  ["/curl-to-ruby", "Convert cURL to Ruby"],
  ["/curl-to-ruby/faraday", "Convert cURL to Ruby Faraday"],
  ["/curl-to-ruby/nethttp", "Convert cURL to Ruby Net::HTTP"],
  ["/curl-to-rust", "Convert cURL to Rust"],
  ["/curl-to-rust/reqwest", "Convert cURL to Rust reqwest"],
  ["/curl-to-rust/ureq", "Convert cURL to Rust ureq"],
  ["/curl-to-typescript", "Convert cURL to TypeScript"],
  ["/curl-to-typescript/axios", "Convert cURL to TypeScript Axios"],
  ["/curl-to-typescript/fetch", "Convert cURL to TypeScript Fetch"],
  ["/curl-to-typescript/undici", "Convert cURL to TypeScript Undici"],
  ["/javascript-to-curl", "Convert JavaScript to cURL"],
  ["/javascript-to-curl/axios", "Convert JavaScript Axios to cURL"],
  ["/javascript-to-curl/fetch", "Convert JavaScript Fetch to cURL"],
  ["/typescript-to-curl", "Convert TypeScript to cURL"],
  ["/typescript-to-curl/axios", "Convert TypeScript Axios to cURL"],
  ["/typescript-to-curl/fetch", "Convert TypeScript Fetch to cURL"],
  ["/python-to-curl", "Convert Python to cURL"],
  ["/python-to-curl/aiohttp", "Convert Python aiohttp to cURL"],
  ["/python-to-curl/httpx", "Convert Python HTTPX to cURL"],
  ["/python-to-curl/requests", "Convert Python Requests to cURL"],
] as const;

async function openConverter(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
}

async function chooseTarget(
  page: Page,
  label: "Language" | "Client",
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("converts a POST JSON cURL to Python Requests", async ({ page }) => {
  await openConverter(page);
  await page
    .getByLabel("cURL command")
    .fill(
      `curl 'https://api.example.com/users' -X POST -H 'Content-Type: application/json' --data-raw '{"name":"Eklavya"}'`,
    );
  await chooseTarget(page, "Language", "Python");
  await chooseTarget(page, "Client", "Requests");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /requests\.post/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(/data=/u);
});

test("converts cURL to JavaScript Fetch", async ({ page }) => {
  await openConverter(page);
  await page
    .getByLabel("cURL command")
    .fill("curl -L 'https://api.example.com/users?page=1'");
  await chooseTarget(page, "Language", "JavaScript");
  await chooseTarget(page, "Client", "Fetch");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /await fetch\("https:\/\/api\.example\.com\/users\?page=1"\)/u,
  );
});

test("converts a static Fetch call back to cURL", async ({ page }) => {
  await openConverter(page);
  await page.getByRole("button", { name: "Code → cURL" }).click();
  await page
    .getByLabel("JavaScript, TypeScript, or Python request code")
    .fill(
      `fetch("https://api.example.com/users", { method: "DELETE", redirect: "manual" });`,
    );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /curl 'https:\/\/api\.example\.com\/users'/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(/-X DELETE/u);
});

test("reports dynamic Fetch expressions explicitly", async ({ page }) => {
  await openConverter(page);
  await page.getByRole("button", { name: "Code → cURL" }).click();
  await page
    .getByLabel("JavaScript, TypeScript, or Python request code")
    .fill("fetch(getApiUrl(), { headers: getHeaders() });");
  await expect(page.getByRole("alert")).toContainText(
    "Dynamic URL cannot be resolved statically",
  );
  await expect(page.getByRole("alert")).toContainText("getHeaders()");
});

test("reads Python back to cURL and reveals libraries after choosing a language", async ({
  page,
}) => {
  await openConverter(page);
  await page.getByRole("button", { name: "Code → cURL" }).click();

  const source = page.getByRole("combobox", {
    name: "Language",
    exact: true,
  });
  await expect(source).toHaveAttribute("data-value", "auto");
  await expect(page.getByRole("combobox", { name: "Library" })).toHaveCount(0);

  await page
    .getByLabel("JavaScript, TypeScript, or Python request code")
    .fill(
      `import requests\nrequests.post("https://api.example.com/py", json={"name": "Ada"}, headers={"Authorization": "Bearer tok"})`,
    );
  await expect(page.getByLabel("Converted output")).toHaveValue(/-X POST/u);
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /--data-raw '\{"name":"Ada"\}'/u,
  );
  await expect(page.getByText("Detected Requests.")).toBeVisible();

  // Forcing a language must actually re-read the snippet.
  await source.click();
  await page.getByRole("option", { name: "Python", exact: true }).click();
  await expect(source).toHaveAttribute("data-value", "python");
  await expect(
    page.getByRole("combobox", { name: "Library", exact: true }),
  ).toHaveAttribute("data-value", "requests");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /curl 'https:\/\/api\.example\.com\/py'/u,
  );
});

test("SEO pages keep their language and client for Code to cURL", async ({
  page,
}) => {
  await page.goto("/curl-to-python/httpx");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await page.getByRole("button", { name: "Code → cURL" }).click();

  await expect(
    page.getByRole("combobox", { name: "Language" }),
  ).toHaveAttribute("data-value", "python");
  await expect(page.getByRole("combobox", { name: "Library" })).toHaveAttribute(
    "data-value",
    "httpx",
  );
  await expect(page.getByLabel("Python HTTPX request code")).toHaveValue(
    /import httpx/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /curl 'https:\/\/api\.example\.com\/users\?page=1'/u,
  );
  await expect(page.getByText("Parsed as Python HTTPX.")).toBeVisible();
});

test("forward SEO pages without a reverse parser use auto-detect", async ({
  page,
}) => {
  await page.goto("/curl-to-go/resty");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await page.getByRole("button", { name: "Code → cURL" }).click();

  await expect(
    page.getByRole("combobox", { name: "Language" }),
  ).toHaveAttribute("data-value", "auto");
  await expect(page.getByRole("combobox", { name: "Library" })).toHaveCount(0);
  await expect(
    page.getByLabel("JavaScript, TypeScript, or Python request code"),
  ).toHaveValue(/fetch/u);
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /curl 'https:\/\/api\.example\.com\/users'/u,
  );
});

test("reverse SEO pages open in the matching mode, language, and library", async ({
  page,
}) => {
  await page.goto("/javascript-to-curl/axios");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();

  await expect(
    page.getByRole("button", { name: "Code → cURL" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", { name: "Language" }),
  ).toHaveAttribute("data-value", "javascript");
  await expect(page.getByRole("combobox", { name: "Library" })).toHaveAttribute(
    "data-value",
    "axios",
  );
  await expect(page.getByLabel("JavaScript Axios request code")).toHaveValue(
    /import axios/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /curl 'https:\/\/api\.example\.com\/users\?page=1'/u,
  );
});

test("keeps the converter usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConverter(page);
  const source = page.getByLabel("cURL command");
  const output = page.getByLabel("Converted output");
  const clear = page.getByRole("button", { name: "Clear" });
  const copy = page.getByRole("button", { name: "Copy" });
  await source.fill(
    `curl 'https://api.example.com/a/very/long/path/that/must/scroll/inside/the/editor' -H 'Authorization: Bearer a-long-local-placeholder-token'`,
  );
  await expect(source).toBeVisible();
  await expect(output).toBeVisible();
  await expect(clear).toBeVisible();
  await expect(copy).toBeVisible();
  const [sourceBox, outputBox, clearBox, copyBox] = await Promise.all([
    source.boundingBox(),
    output.boundingBox(),
    clear.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(sourceBox).not.toBeNull();
  expect(outputBox).not.toBeNull();
  expect(clearBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect((outputBox?.y ?? 0) > (sourceBox?.y ?? 0)).toBe(true);
  expect((clearBox?.x ?? 0) + (clearBox?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((copyBox?.x ?? 0) + (copyBox?.width ?? 0)).toBeLessThanOrEqual(390);
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test("converts a static Axios call and loads its AST parser on demand", async ({
  page,
}) => {
  await openConverter(page);
  const scriptsBefore = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.initiatorType === "script")
      .map((entry) => entry.name),
  );
  await page.getByRole("button", { name: "Code → cURL" }).click();
  await page
    .getByLabel("JavaScript, TypeScript, or Python request code")
    .fill(
      `axios.post("https://api.example.com/users", { name: "Ada" }, { headers: { "X-Key": "local" } });`,
    );
  await expect(page.getByLabel("Converted output")).toHaveValue(/-X POST/u);
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /Content-Type: application\/json/u,
  );
  await expect(page.getByText("Detected Axios.")).toBeVisible();
  const scriptsAfter = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.initiatorType === "script")
      .map((entry) => entry.name),
  );
  expect(scriptsAfter.length).toBeGreaterThan(scriptsBefore.length);
});

test("reports invalid cURL without executing the represented request", async ({
  page,
}) => {
  const representedRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "do-not-contact.invalid") {
      representedRequests.push(request.url());
    }
  });
  await openConverter(page);
  await page
    .getByLabel("cURL command")
    .fill("curl --compressed https://do-not-contact.invalid/private");
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported cURL option: --compressed",
  );
  expect(representedRequests).toEqual([]);
});

test("language pages render unique SEO metadata and a working converter", async ({
  page,
}) => {
  await page.goto("/curl-to-python");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(page).toHaveTitle(/cURL to Python/u);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://curltocode.com/curl-to-python",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Convert cURL to Python",
  );
  await expect(page.getByLabel("Language")).toHaveAttribute(
    "data-value",
    "python",
  );
  await expect(page.getByText("pip install requests")).toBeVisible();
});

test("new language and client pages initialize their real generators", async ({
  page,
}) => {
  await page.goto("/curl-to-go");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(page.getByLabel("Language")).toHaveAttribute("data-value", "go");
  await expect(page.getByLabel("Client")).toHaveAttribute(
    "data-value",
    "nethttp",
  );
  await expect(page.getByLabel("Client")).toBeEnabled();
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /package main/u,
  );

  await page.goto("/curl-to-java/okhttp");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(page.getByLabel("Language")).toHaveAttribute(
    "data-value",
    "java",
  );
  await expect(page.getByLabel("Client")).toHaveAttribute(
    "data-value",
    "okhttp",
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /OkHttpClient/u,
  );
  await expect(page.getByText(/okhttp:5\.3\.2/u)).toBeVisible();

  await page.goto("/curl-to-python/aiohttp");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(page.getByLabel("Language")).toHaveAttribute(
    "data-value",
    "python",
  );
  await expect(page.getByLabel("Client")).toHaveAttribute(
    "data-value",
    "aiohttp",
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /aiohttp\.ClientSession/u,
  );
  await expect(page.getByText("pip install aiohttp")).toBeVisible();
});

test("every indexable page renders canonical metadata and structured data", async ({
  page,
  request,
}) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const [path, heading] of indexablePages) {
    await page.goto(path);
    const title = await page.title();
    const description =
      (await page
        .locator('meta[name="description"]')
        .getAttribute("content")) ?? "";
    expect(title.length).toBeGreaterThan(20);
    expect(description.length).toBeGreaterThan(80);
    expect(titles.has(title)).toBe(false);
    expect(descriptions.has(description)).toBe(false);
    titles.add(title);
    descriptions.add(description);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://curltocode.com${path === "/" ? "/" : path}`,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      title,
    );
    const ogImage =
      (await page
        .locator('meta[property="og:image"]')
        .getAttribute("content")) ?? "";
    expect(ogImage).toMatch(
      /^https:\/\/curltocode\.com\/og\/[a-z0-9-]+\.png$/u,
    );
    const imageResponse = await request.get(new URL(ogImage).pathname);
    expect(imageResponse.ok()).toBe(true);
    expect(imageResponse.headers()["content-type"]).toBe("image/png");
    const schema = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(schema).not.toBeNull();
    const parsed = JSON.parse(schema ?? "") as {
      readonly "@graph": readonly {
        readonly "@type": string;
        readonly itemListElement?: readonly {
          readonly name: string;
          readonly position: number;
        }[];
      }[];
    };
    const pageTypes = parsed["@graph"].map((entry) => entry["@type"]);
    expect(pageTypes).toContain("WebPage");
    if (path !== "/") {
      const breadcrumb = parsed["@graph"].find(
        (entry) => entry["@type"] === "BreadcrumbList",
      );
      expect(breadcrumb?.itemListElement?.[0]).toMatchObject({
        name: "Home",
        position: 1,
      });
    }
  }
});

test("serves installable app metadata and a dedicated maskable icon", async ({
  request,
}) => {
  const manifestResponse = await request.get("/site.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    readonly name: string;
    readonly icons: readonly {
      readonly src: string;
      readonly purpose?: string;
    }[];
  };
  expect(manifest.name).toBe("CurlToCode");
  const maskable = manifest.icons.find((icon) => icon.purpose === "maskable");
  expect(maskable?.src).toBe("/icon-maskable-512.png");
  const iconResponse = await request.get(maskable?.src ?? "/missing");
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toBe("image/png");
});

test("serves both favicon formats, including the conventional /favicon.ico", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.locator('link[rel="icon"][href="/favicon.ico"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('link[rel="icon"][href="/favicon.svg"]'),
  ).toHaveCount(1);

  const svg = await request.get("/favicon.svg");
  expect(svg.ok()).toBe(true);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");

  // Clients probe this path directly whatever the markup declares. Serving the
  // HTML 404 here is the regression this guards against, so the body is checked
  // rather than only the status.
  const ico = await request.get("/favicon.ico");
  expect(ico.ok()).toBe(true);
  const body = await ico.body();
  expect(body.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
  expect(body.readUInt16LE(4)).toBeGreaterThanOrEqual(3);
});

test("persists theme preference and keeps keyboard focus visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("curltocode-theme") === null) {
      window.localStorage.setItem("curltocode-theme", "dark");
    }
  });
  await openConverter(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkToggle = page.getByRole("button", {
    name: "Theme: dark. Change theme",
  });
  await expect(darkToggle).toBeVisible();
  await expect(darkToggle.locator('[data-theme-icon="dark"]')).toBeVisible();

  await darkToggle.click();
  const systemToggle = page.getByRole("button", {
    name: "Theme: system. Change theme",
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(
    systemToggle.locator('[data-theme-icon="system"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("curltocode-theme")),
  ).toBeNull();

  await systemToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("curltocode-theme")),
  ).toBe("light");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Theme: light. Change theme" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
});

test("masks inspector secrets while preserving source and generated output", async ({
  page,
}) => {
  await openConverter(page);
  await page
    .getByLabel("cURL command")
    .fill(
      "curl 'https://ada:super-secret@example.com/path?api_key=query-secret' -H 'X-API-Key: header-secret'",
    );
  const inspector = page.locator(".inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector).not.toContainText("super-secret");
  await expect(inspector).not.toContainText("query-secret");
  await expect(inspector).not.toContainText("header-secret");
  await expect(inspector).toContainText("••••••••");
  await expect(page.getByLabel("cURL command")).toHaveValue(/super-secret/u);
  await chooseTarget(page, "Client", "Axios");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /super-secret/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /header-secret/u,
  );
});

test("404 is noindex and excluded from the generated sitemap", async ({
  page,
  request,
}) => {
  await page.goto(`${productionBaseUrl}/does-not-exist`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Page not found",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  const sitemapIndex = await (
    await request.get(`${productionBaseUrl}/sitemap-index.xml`)
  ).text();
  expect(sitemapIndex).not.toContain("404");
  const sitemapPath = sitemapIndex.match(/<loc>([^<]+)<\/loc>/u)?.[1];
  expect(sitemapPath).toBeDefined();
  if (sitemapPath !== undefined) {
    const sitemap = await (
      await request.get(`${productionBaseUrl}${new URL(sitemapPath).pathname}`)
    ).text();
    expect(sitemap).not.toContain("/404");
    expect(sitemap).not.toContain("does-not-exist");
    expect(sitemap).not.toContain("<lastmod>");
    for (const [path] of indexablePages) {
      const canonical =
        path === "/"
          ? "https://curltocode.com"
          : `https://curltocode.com${path}`;
      expect(sitemap).toContain(`<loc>${canonical}</loc>`);
    }
  }
});
