import { Buffer } from "node:buffer";

import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import {
  generateCode,
  GeneratorError,
  generatorTargets,
} from "../src/index.js";
import type { GeneratorErrorCode, GeneratorId } from "../src/index.js";
import { REAL_WORLD_REQUESTS } from "./real-world-fixtures.js";

interface TargetProfile {
  readonly signature: string;
  readonly dependency: string | undefined;
  readonly duplicateHeaders: "preserve" | GeneratorErrorCode;
  readonly duplicateCookies: "preserve" | GeneratorErrorCode;
  readonly customMethod: "preserve" | GeneratorErrorCode;
  readonly redirects: "preserve" | GeneratorErrorCode;
  readonly multipartFile: "preserve" | GeneratorErrorCode;
  readonly binaryFile: "preserve" | GeneratorErrorCode;
}

const profiles = {
  "javascript-fetch": {
    signature: "await fetch(",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "javascript-axios": {
    signature: "await axios({",
    dependency: "npm install axios",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "javascript-undici": {
    signature: 'from "undici"',
    dependency: "npm install undici",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "typescript-fetch": {
    signature: "satisfies RequestInit",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "typescript-axios": {
    signature: "satisfies AxiosRequestConfig",
    dependency: "npm install axios",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "typescript-undici": {
    signature: 'from "undici"',
    dependency: "npm install undici",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-requests": {
    signature: "response = requests.get(",
    dependency: "pip install requests",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "GENERATOR_DUPLICATE_COOKIES",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-httpx": {
    signature: "response = httpx.get(",
    dependency: "pip install httpx",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "GENERATOR_DUPLICATE_COOKIES",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-aiohttp": {
    signature: "aiohttp.ClientSession()",
    dependency: "pip install aiohttp",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "go-nethttp": {
    signature: "http.NewRequest(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "go-resty": {
    signature: "resty.New()",
    dependency: "go get resty.dev/v3",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-curl": {
    signature: "curl_setopt_array",
    dependency: "Requires the PHP cURL extension (ext-curl).",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-guzzle": {
    signature: "new GuzzleHttp\\Client()",
    dependency: "composer require guzzlehttp/guzzle",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "java-httpclient": {
    signature: "HttpRequest.newBuilder()",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_UNSUPPORTED_BODY",
    binaryFile: "preserve",
  },
  "java-okhttp": {
    signature: "new OkHttpClient.Builder()",
    dependency: 'implementation("com.squareup.okhttp3:okhttp:5.3.2")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "java-apache": {
    signature: "HttpClients.custom()",
    dependency:
      'implementation("org.apache.httpcomponents.client5:httpclient5:5.6.2")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "csharp-httpclient": {
    signature: "new HttpRequestMessage(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "csharp-restsharp": {
    signature: "new RestRequest(",
    dependency: "dotnet add package RestSharp --version 114.0.0",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "ruby-nethttp": {
    signature: "Net::HTTP::Get.new(uri)",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_UNSUPPORTED_BODY",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "ruby-faraday": {
    signature: "Faraday.new",
    dependency: "gem install faraday",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "rust-reqwest": {
    signature: "reqwest::Client::builder()",
    dependency:
      'reqwest = "0.13"\ntokio = { version = "1", features = ["full"] }',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "rust-ureq": {
    signature: "Agent::config_builder()",
    dependency: 'ureq = "3.3"',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_UNSUPPORTED_BODY",
    binaryFile: "preserve",
  },
} as const satisfies Readonly<Record<GeneratorId, TargetProfile>>;

function result(command: string, id: GeneratorId) {
  return generateCode(parseCurl(command).request, id);
}

function code(command: string, id: GeneratorId): string {
  return result(command, id).code;
}

function expectCapability(
  command: string,
  id: GeneratorId,
  capability: "preserve" | GeneratorErrorCode,
  assertions: (generated: string) => void,
): void {
  if (capability === "preserve") {
    assertions(code(command, id));
    return;
  }
  try {
    code(command, id);
    expect.unreachable(`${id} should report ${capability}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GeneratorError);
    expect((error as GeneratorError).code).toBe(capability);
  }
}

describe("real-world target profiles", () => {
  it("covers every registered language and library exactly once", () => {
    expect(Object.keys(profiles).sort()).toEqual(
      generatorTargets.map(({ id }) => id).sort(),
    );
  });
});

describe.each(generatorTargets)("$id real-world conformance", (target) => {
  const profile = profiles[target.id];

  it("reports accurate registry metadata and dependency guidance", () => {
    const generated = result(REAL_WORLD_REQUESTS.health, target.id);
    expect(generated.language).toBe(target.language);
    expect(generated.client).toBe(target.client);
    expect(generated.dependency).toBe(profile.dependency);
    expect(generated.code).toContain(profile.signature);
  });

  it("preserves encoded and duplicate query parameters plus request headers", () => {
    const generated = code(REAL_WORLD_REQUESTS.search, target.id);
    expect(generated).toContain(
      "https://api.example.com/v1/search?q=hello+world&tag=typescript&tag=security",
    );
    expect(generated).toContain("Accept");
    expect(generated).toContain("application/json");
    expect(generated).toContain("X-Request-ID");
    expect(generated).toContain("req-2026-08-13");
  });

  it("preserves PATCH JSON, bearer auth, cookies, arrays, and Unicode", () => {
    const generated = code(REAL_WORLD_REQUESTS.accountPatch, target.id);
    expect(generated.toLowerCase()).toContain("patch");
    expect(generated).toContain("tok_live_123");
    expect(generated).toContain("session");
    expect(generated).toContain("sess_abc");
    expect(generated).toContain("locale");
    expect(generated).toContain("en-IN");
    expect(generated).toContain("displayName");
    expect(generated).toContain("Eklavya 👋");
    expect(generated).toContain("developer");
  });

  it("preserves basic-auth credentials without dropping password colons", () => {
    const generated = code(REAL_WORLD_REQUESTS.basicAuth, target.id);
    const encoded = Buffer.from("service-user:p@ss:word").toString("base64");
    expect(
      (generated.includes("service-user") && generated.includes("p@ss:word")) ||
        generated.includes(encoded),
    ).toBe(true);
  });

  it("preserves exact OAuth form bytes and repeated fields", () => {
    const generated = code(REAL_WORLD_REQUESTS.oauthForm, target.id);
    expect(generated).toContain(
      "grant_type=client_credentials&scope=read&scope=write",
    );
    expect(generated).toContain("application/x-www-form-urlencoded");
  });

  it("preserves multiline UTF-8 text and its content type", () => {
    const generated = code(REAL_WORLD_REQUESTS.webhookText, target.id);
    expect(generated.toLowerCase()).toContain("post");
    expect(generated).toContain("text/plain; charset=utf-8");
    expect(generated).toContain("deployment complete 🚀");
    expect(generated).toContain("second line");
  });

  it("preserves redirect policy or returns the documented limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.search.replace("curl ", "curl -L "),
      target.id,
      profile.redirects,
      (followed) => {
        const notFollowed = code(REAL_WORLD_REQUESTS.search, target.id);
        expect(followed).not.toBe(notFollowed);
      },
    );
  });

  it("preserves a custom PURGE method or returns a typed limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.customMethod,
      target.id,
      profile.customMethod,
      (generated) => {
        expect(generated.toLowerCase()).toContain("purge");
        expect(generated).toContain("user-42");
      },
    );
  });

  it("preserves duplicate headers or returns a duplicate-header error", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.duplicateHeaders,
      target.id,
      profile.duplicateHeaders,
      (generated) => {
        expect(generated).toContain("alpha");
        expect(generated).toContain("beta");
      },
    );
  });

  it("preserves duplicate cookies or returns a duplicate-cookie error", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.duplicateCookies,
      target.id,
      profile.duplicateCookies,
      (generated) => {
        expect(generated).toContain("first");
        expect(generated).toContain("second");
      },
    );
  });

  it("preserves multipart metadata or returns a file/body limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.multipartUpload,
      target.id,
      profile.multipartFile,
      (generated) => {
        expect(generated).toContain("description");
        expect(generated).toContain("Quarterly report");
        expect(generated).toContain("document");
        expect(generated).toContain("/tmp/report.pdf");
        expect(generated).toContain("application/pdf");
      },
    );
  });

  it("preserves file-backed binary bodies or returns a file limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.binaryFile,
      target.id,
      profile.binaryFile,
      (generated) => {
        expect(generated.toLowerCase()).toContain("put");
        expect(generated).toContain("payload.bin");
        expect(generated).toContain("application/octet-stream");
      },
    );
  });

  it("preserves inline binary bytes separately from file references", () => {
    const generated = code(REAL_WORLD_REQUESTS.inlineBinary, target.id);
    expect(generated).toContain("protobuf-wire-bytes-01");
    expect(generated).toContain("application/octet-stream");
  });

  it("preserves DELETE queries, preconditions, and audit headers", () => {
    const generated = code(REAL_WORLD_REQUESTS.deleteWithTrace, target.id);
    expect(generated.toLowerCase()).toContain("delete");
    expect(generated).toContain("user-42?hard=true");
    expect(generated).toContain("If-Match");
    expect(generated).toContain("etag-user-42");
    expect(generated).toContain("X-Audit-Reason");
    expect(generated).toContain("duplicate-account");
  });

  it("is deterministic across repeated generation", () => {
    expect(code(REAL_WORLD_REQUESTS.accountPatch, target.id)).toBe(
      code(REAL_WORLD_REQUESTS.accountPatch, target.id),
    );
  });
});
