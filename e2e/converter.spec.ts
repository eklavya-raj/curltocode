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
  ["/javascript-to-curl/undici", "Convert Node.js Undici to cURL"],
  ["/javascript-to-curl/fetch", "Convert JavaScript Fetch to cURL"],
  ["/typescript-to-curl", "Convert TypeScript to cURL"],
  ["/typescript-to-curl/axios", "Convert TypeScript Axios to cURL"],
  ["/typescript-to-curl/undici", "Convert TypeScript Undici to cURL"],
  ["/typescript-to-curl/fetch", "Convert TypeScript Fetch to cURL"],
  ["/python-to-curl", "Convert Python to cURL"],
  ["/python-to-curl/aiohttp", "Convert Python aiohttp to cURL"],
  ["/python-to-curl/httpx", "Convert Python HTTPX to cURL"],
  ["/python-to-curl/requests", "Convert Python Requests to cURL"],
  ["/php-to-curl", "Convert PHP to cURL"],
  ["/php-to-curl/curl", "Convert PHP cURL to a cURL command"],
  ["/php-to-curl/guzzle", "Convert Guzzle to a cURL command"],
  ["/go-to-curl", "Convert Go to cURL"],
  ["/go-to-curl/nethttp", "Convert Go net/http to a cURL command"],
  ["/go-to-curl/resty", "Convert Go Resty to a cURL command"],
  ["/java-to-curl", "Convert Java to cURL"],
  ["/java-to-curl/httpclient", "Convert Java HttpClient to a cURL command"],
  ["/java-to-curl/okhttp", "Convert Java OkHttp to a cURL command"],
  ["/java-to-curl/apache", "Convert Apache HttpClient to a cURL command"],
  ["/csharp-to-curl", "Convert C# to cURL"],
  ["/csharp-to-curl/httpclient", "Convert C# HttpClient to a cURL command"],
  ["/csharp-to-curl/restsharp", "Convert C# RestSharp to a cURL command"],
  ["/ruby-to-curl", "Convert Ruby to cURL"],
  ["/ruby-to-curl/nethttp", "Convert Ruby Net::HTTP to a cURL command"],
  ["/ruby-to-curl/faraday", "Convert Ruby Faraday to a cURL command"],
  ["/rust-to-curl", "Convert Rust to cURL"],
  ["/rust-to-curl/reqwest", "Convert Rust reqwest to a cURL command"],
  ["/rust-to-curl/ureq", "Convert Rust ureq to a cURL command"],
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
    .getByLabel("Request code in any supported language")
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
    .getByLabel("Request code in any supported language")
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
    .getByLabel("Request code in any supported language")
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
  // Every registered target now has a reverse parser, so this checks the
  // homepage default rather than a fallback.
  await page.goto("/");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await page.getByRole("button", { name: "Code → cURL" }).click();

  await expect(
    page.getByRole("combobox", { name: "Language" }),
  ).toHaveAttribute("data-value", "auto");
  await expect(page.getByRole("combobox", { name: "Library" })).toHaveCount(0);
  await expect(
    page.getByLabel("Request code in any supported language"),
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

test("keeps converter groups and cards visually separated", async ({
  page,
}) => {
  await page.goto("/converters");

  const groups = page.locator(".converter-group");
  const cards = page.locator(".converter-index-item");
  await expect(groups).toHaveCount(2);
  await expect(cards).toHaveCount(18);

  const [forwardBox, reverseBox] = await Promise.all([
    groups.first().boundingBox(),
    groups.last().boundingBox(),
  ]);
  expect(forwardBox).not.toBeNull();
  expect(reverseBox).not.toBeNull();
  const minimumGroupGap =
    (page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 760 ? 48 : 54;
  expect(
    (reverseBox?.y ?? 0) - ((forwardBox?.y ?? 0) + (forwardBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(minimumGroupGap);

  const cardSurface = await cards.first().evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      borderWidth: Number.parseFloat(style.borderTopWidth),
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  });
  expect(cardSurface.borderWidth).toBeGreaterThanOrEqual(1);
  expect(cardSurface.paddingTop).toBeGreaterThanOrEqual(18);
  await expect(groups.first().getByRole("heading", { level: 3 })).toHaveCount(
    9,
  );
});

test("gives generated examples readable spacing and mobile breadcrumbs", async ({
  page,
}) => {
  await page.goto("/javascript-to-curl/fetch");

  const block = page.locator(".example-block").first();
  const heading = block.getByRole("heading", { level: 3 });
  const summary = block.locator(".example-summary");
  const caption = block.locator("figcaption").first();
  const code = block.locator("pre").first();
  const [headingBox, summaryBox, captionBox, codeBox] = await Promise.all([
    heading.boundingBox(),
    summary.boundingBox(),
    caption.boundingBox(),
    code.boundingBox(),
  ]);
  expect(headingBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect(captionBox).not.toBeNull();
  expect(codeBox).not.toBeNull();
  expect(
    (summaryBox?.y ?? 0) - ((headingBox?.y ?? 0) + (headingBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(8);
  expect(
    (captionBox?.y ?? 0) - ((summaryBox?.y ?? 0) + (summaryBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(18);
  expect(
    (codeBox?.y ?? 0) - ((captionBox?.y ?? 0) + (captionBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(8);

  const lastExample = page.locator(".example-block").last();
  const firstContentHeading = page
    .locator(".converter-content > .shell > h2")
    .first();
  const [lastExampleBox, firstContentHeadingBox] = await Promise.all([
    lastExample.boundingBox(),
    firstContentHeading.boundingBox(),
  ]);
  expect(lastExampleBox).not.toBeNull();
  expect(firstContentHeadingBox).not.toBeNull();
  expect(
    (firstContentHeadingBox?.y ?? 0) -
      ((lastExampleBox?.y ?? 0) + (lastExampleBox?.height ?? 0)),
  ).toBeGreaterThanOrEqual(56);

  const contentRhythm = await page
    .locator(".converter-content > .shell")
    .evaluate((shell) => {
      const directChildren = Array.from(shell.children);
      const contentHeadings = directChildren.filter(
        (element) => element.tagName === "H2",
      );
      const laterHeading = contentHeadings[1];
      const previousParagraph = laterHeading?.previousElementSibling;
      const consecutiveParagraph = directChildren.find(
        (element) =>
          element.tagName === "P" &&
          element.previousElementSibling?.tagName === "P",
      );
      const previousConsecutiveParagraph =
        consecutiveParagraph?.previousElementSibling;

      const gapBetween = (first?: Element | null, second?: Element | null) => {
        if (
          first === undefined ||
          first === null ||
          second === undefined ||
          second === null
        ) {
          return null;
        }
        return (
          second.getBoundingClientRect().top -
          first.getBoundingClientRect().bottom
        );
      };

      return {
        headingGap: gapBetween(previousParagraph, laterHeading),
        paragraphGap: gapBetween(
          previousConsecutiveParagraph,
          consecutiveParagraph,
        ),
      };
    });
  expect(contentRhythm.headingGap).not.toBeNull();
  expect(contentRhythm.headingGap ?? 0).toBeGreaterThanOrEqual(48);
  expect(contentRhythm.paragraphGap).not.toBeNull();
  expect(contentRhythm.paragraphGap ?? 0).toBeGreaterThanOrEqual(14);

  await page.setViewportSize({ width: 390, height: 844 });
  const currentCrumb = page.locator(".breadcrumbs li").last();
  const crumbBox = await currentCrumb.boundingBox();
  expect(crumbBox).not.toBeNull();
  expect(crumbBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(25);
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test("collapses crowded navigation at tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/converters");

  await expect(page.locator(".nav-links")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open navigation menu" }),
  ).toBeVisible();
});

test("wraps long library coordinates without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/curl-to-java/apache-httpclient");

  await expect(page.locator(".dependency-note")).toBeVisible();
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
    .getByLabel("Request code in any supported language")
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
    .fill("curl --netrc https://do-not-contact.invalid/private");
  await expect(page.getByRole("alert")).toContainText(
    "--netrc cannot be converted because credentials would have to be read from a .netrc file.",
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
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveAttribute("data-value", "python");
  await expect(page.getByText("pip install requests")).toBeVisible();
});

test("new language and client pages initialize their real generators", async ({
  page,
}) => {
  await page.goto("/curl-to-go");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveAttribute("data-value", "go");
  await expect(
    page.getByRole("combobox", { name: "Client", exact: true }),
  ).toHaveAttribute("data-value", "nethttp");
  await expect(
    page.getByRole("combobox", { name: "Client", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /package main/u,
  );

  await page.goto("/curl-to-java/okhttp");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveAttribute("data-value", "java");
  await expect(
    page.getByRole("combobox", { name: "Client", exact: true }),
  ).toHaveAttribute("data-value", "okhttp");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /OkHttpClient/u,
  );
  await expect(page.getByText(/okhttp:5\.3\.2/u)).toBeVisible();

  await page.goto("/curl-to-python/aiohttp");
  await page
    .locator('[aria-label="cURL and code converter"][data-ready="true"]')
    .waitFor();
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveAttribute("data-value", "python");
  await expect(
    page.getByRole("combobox", { name: "Client", exact: true }),
  ).toHaveAttribute("data-value", "aiohttp");
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
  const incomingInternalLinks = new Map(
    indexablePages.map(([path]) => [path, new Set<string>()]),
  );
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
    if (path === "/") {
      expect(title).toBe(
        "cURL to Code Converter – Python & JavaScript | CurlToCode",
      );
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Convert cURL to Python, JavaScript, and more",
        }),
      ).toBeVisible();
    }
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
    expect(pageTypes).toContain("Organization");
    expect(pageTypes).toContain("WebSite");
    expect(pageTypes).toContain("WebPage");
    expect(pageTypes).not.toContain("SoftwareApplication");
    if (path !== "/") {
      const breadcrumb = parsed["@graph"].find(
        (entry) => entry["@type"] === "BreadcrumbList",
      );
      expect(breadcrumb?.itemListElement?.[0]).toMatchObject({
        name: "Home",
        position: 1,
      });
    }

    const internalTargets = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => [
        ...new Set(
          links.map((link) => {
            const url = new URL((link as HTMLAnchorElement).href);
            return url.pathname === "/"
              ? "/"
              : url.pathname.replace(/\/$/u, "");
          }),
        ),
      ]);
    for (const target of internalTargets) {
      if (target === path) continue;
      incomingInternalLinks.get(target)?.add(path);
    }
  }

  for (const [path, sources] of incomingInternalLinks) {
    if (path === "/") continue;
    expect(
      sources.size,
      `${path} should have at least two incoming links`,
    ).toBeGreaterThanOrEqual(2);
  }
});

test("serves installable app metadata and a dedicated maskable icon", async ({
  request,
}) => {
  const manifestResponse = await request.get("/site.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    readonly id: string;
    readonly name: string;
    readonly display: string;
    readonly start_url: string;
    readonly shortcuts: readonly { readonly url: string }[];
    readonly icons: readonly {
      readonly src: string;
      readonly purpose?: string;
    }[];
  };
  expect(manifest.name).toBe("CurlToCode");
  expect(manifest.id).toBe("/");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
    "/",
    "/javascript-to-curl",
    "/converters",
  ]);
  const maskable = manifest.icons.find((icon) => icon.purpose === "maskable");
  expect(maskable?.src).toBe("/icon-maskable-512.png");
  const iconResponse = await request.get(maskable?.src ?? "/missing");
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toBe("image/png");
});

test("offers the native PWA install prompt only when available", async ({
  page,
}) => {
  await page.goto("/");
  const installButtons = page.locator("[data-pwa-install]");
  await expect(installButtons).toHaveCount(2);
  await expect(installButtons.first()).toHaveAttribute("hidden", "");
  await expect(installButtons.last()).toHaveAttribute("hidden", "");

  await page.evaluate(() => {
    const state = window as Window & { installPromptCalls?: number };
    state.installPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          state.installPromptCalls = (state.installPromptCalls ?? 0) + 1;
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" }),
      },
    });
    window.dispatchEvent(event);
  });

  if ((page.viewportSize()?.width ?? 0) <= 900) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  } else {
    await page.setViewportSize({ width: 901, height: 900 });
    const headerLayout = await page.locator(".site-nav").evaluate((nav) => {
      const brand = nav.querySelector(".brand")?.getBoundingClientRect();
      const actions = nav
        .querySelector(".nav-actions")
        ?.getBoundingClientRect();
      return {
        overlaps:
          brand !== undefined && actions !== undefined
            ? brand.right > actions.left
            : true,
        pageOverflows:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    expect(headerLayout.overlaps).toBe(false);
    expect(headerLayout.pageOverflows).toBe(false);
  }
  const visibleInstallButton = page.locator("[data-pwa-install]:visible");
  await expect(visibleInstallButton).toHaveCount(1);
  await visibleInstallButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { installPromptCalls?: number })
            .installPromptCalls,
      ),
    )
    .toBe(1);
  await expect(installButtons.first()).toHaveAttribute("hidden", "");
  await expect(installButtons.last()).toHaveAttribute("hidden", "");
});

test("generates a versioned service worker for the production app", async ({
  request,
}) => {
  const response = await request.get(`${productionBaseUrl}/sw.js`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("javascript");
  const source = await response.text();
  expect(source).toMatch(/precache-[a-f0-9]{16}/u);
  expect(source).toContain('"/converters"');
  expect(source).toContain('url.pathname.startsWith("/_astro/")');
  expect(source).toContain('request.method !== "GET"');
  expect(source).toContain('cache: "reload"');
  expect(source).toContain("empty response body");
});

test("keeps a visited converter usable offline", async ({ page, context }) => {
  // Routing disables Chromium's HTTP cache, so this test verifies the service
  // worker's Cache Storage entries rather than passing due to browser caching.
  await context.route("**/*", (route) => route.continue());
  await page.goto(`${productionBaseUrl}/curl-to-python/requests`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cached = await caches.match("/curl-to-python/requests");
        return cached?.ok ?? false;
      }),
    )
    .toBe(true);
  const cachedAppModules = await page.evaluate(async () => {
    const cacheName = (await caches.keys()).find((name) =>
      name.startsWith("curltocode-precache-"),
    );
    if (cacheName === undefined) return [];
    const cache = await caches.open(cacheName);
    const requests = (await cache.keys()).filter((request) =>
      new URL(request.url).pathname.startsWith("/_astro/"),
    );
    return Promise.all(
      requests.map(async (request) => {
        const response = await cache.match(request);
        return {
          path: new URL(request.url).pathname,
          size:
            response === undefined
              ? 0
              : (await response.arrayBuffer()).byteLength,
        };
      }),
    );
  });
  expect(cachedAppModules.length).toBeGreaterThan(0);
  expect(cachedAppModules.every(({ size }) => size > 0)).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Convert cURL to Python Requests",
      }),
    ).toBeVisible();
    await page
      .locator('[aria-label="cURL and code converter"][data-ready="true"]')
      .waitFor();
    await page
      .getByLabel("cURL command")
      .fill("curl 'https://api.example.com/offline'");
    await expect(page.getByLabel("Converted output")).toHaveValue(
      /requests\.get/u,
    );
  } finally {
    await context.setOffline(false).catch(() => undefined);
  }
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

test("offers an accessible GitHub star link without loading GitHub", async ({
  page,
}) => {
  const githubRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "github.com") {
      githubRequests.push(request.url());
    }
  });
  await openConverter(page);

  const star = page.getByRole("link", {
    name: "Star CurlToCode on GitHub (opens in a new tab)",
  });
  await expect(star).toBeVisible();
  await expect(star).toHaveAttribute(
    "href",
    "https://github.com/eklavya-raj/curltocode",
  );
  await expect(star).toHaveAttribute("target", "_blank");
  expect(githubRequests).toEqual([]);
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
  await expect(inspector).toContainText("Sensitive value hidden");
  await inspector.getByRole("button", { name: "Reveal" }).click();
  await expect(inspector).toContainText("Sensitive value visible");
  await expect(inspector).toContainText("super-secret");
  await expect(inspector).toContainText("query-secret");
  await expect(inspector).toContainText("header-secret");
  await inspector.getByRole("button", { name: "Hide" }).click();
  await expect(inspector).not.toContainText("super-secret");
  await expect(page.getByLabel("cURL command")).toHaveValue(/super-secret/u);
  await chooseTarget(page, "Client", "Axios");
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /super-secret/u,
  );
  await expect(page.getByLabel("Converted output")).toHaveValue(
    /header-secret/u,
  );
});

test("indexable pages request the largest available SERP treatment", async ({
  page,
}) => {
  // Without these directives Google caps results at a short text-only snippet,
  // which wastes the code example that is the point of every converter page.
  for (const path of ["/", "/curl-to-python/requests", "/javascript-to-curl"]) {
    await page.goto(path);
    const robots =
      (await page.locator('meta[name="robots"]').getAttribute("content")) ?? "";
    expect(robots).toContain("index, follow");
    expect(robots).toContain("max-snippet:-1");
    expect(robots).toContain("max-image-preview:large");
    await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute(
      "href",
      "/sitemap-index.xml",
    );
  }
});

test("converter reference pages carry article structured data", async ({
  page,
}) => {
  await page.goto("/curl-to-python/requests");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "article",
  );
  const schema =
    (await page.locator('script[type="application/ld+json"]').textContent()) ??
    "";
  const graph = (
    JSON.parse(schema) as {
      readonly "@graph": readonly Record<string, unknown>[];
    }
  )["@graph"];
  const article = graph.find((node) => node["@type"] === "TechArticle");
  expect(article).toBeDefined();
  expect(article?.headline).toBe("Convert cURL to Python Requests");
  const part = article?.hasPart as
    | { readonly programmingLanguage?: string; readonly text?: string }
    | undefined;
  // The sample must be the page's real generated example, not placeholder text.
  expect(part?.programmingLanguage).toBe("Python");
  expect(part?.text).toContain("import requests");
});

test("navigation hubs stay WebPage rather than claiming to be articles", async ({
  page,
}) => {
  await page.goto("/converters");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  const schema =
    (await page.locator('script[type="application/ld+json"]').textContent()) ??
    "";
  expect(schema).not.toContain("TechArticle");
});

test("footer link groups do not pollute the heading outline", async ({
  page,
}) => {
  await page.goto("/curl-to-python/requests");
  // Footer group labels are navigation, not sections; emitting them as h2 put
  // five extra entries into every page's outline.
  await expect(
    page.locator("footer").getByRole("heading", { level: 2 }),
  ).toHaveCount(0);
  // One footer landmark, not one per link group.
  await expect(page.locator("footer nav")).toHaveCount(1);
  await expect(page.locator("footer nav[aria-label='Footer']")).toBeVisible();
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
