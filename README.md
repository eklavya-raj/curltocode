# CurlToCode

CurlToCode is a local-first developer tool for converting cURL to code and statically resolvable JavaScript or TypeScript requests back to cURL. The website is designed for `https://curltocode.com`; the `curltocode` workspace package is the future npm API.

## Supported conversions

- cURL to JavaScript Fetch, Axios, and Undici
- cURL to TypeScript Fetch, Axios, and Undici
- cURL to Python Requests, HTTPX, and aiohttp
- cURL to Go net/http and Resty v3
- cURL to PHP's cURL extension and Guzzle
- cURL to Java JDK HttpClient, OkHttp, and Apache HttpClient 5
- cURL to C# HttpClient and RestSharp
- cURL to Ruby Net::HTTP and Faraday
- cURL to Rust reqwest and ureq
- JavaScript/TypeScript Fetch and Axios to POSIX-shell cURL

Conversion is static. The project never executes cURL or pasted code, never contacts represented URLs, and does not persist raw converter input.

## Architecture

```text
cURL → shell tokenizer → cURL parser → HttpRequest → generator registry → code
code → Babel AST parser → HttpRequest → POSIX cURL generator
```

- `packages/core`: typed HTTP request model, state-machine tokenizer, cURL parser, normalization, validation, and domain errors.
- `packages/generators`: forward generators, registry, POSIX cURL generator, and an independently importable AST reverse parser.
- `packages/curltocode`: small public facade (`convert`, `parseCurl`, `generateCode`, `parseCode`, `codeToCurl`, and read-only `supportedTargets` metadata). Reverse APIs are async so browsers can lazy-load the AST parser.
- `apps/web`: static Astro pages and one React converter island. Static SEO content is not hydrated.

The core and generator packages do not depend on React, Astro, Tailwind, the DOM, or website routing.

### Correctness boundaries

- Request bodies retain their normalized kind and original raw JSON/form bytes. Generators avoid JSON reserialization when it would change those bytes.
- Duplicate headers remain ordered in the model and cURL output. Clients with mapping-only header APIs, including Fetch, Axios, Requests, HTTPX, and Faraday, emit a controlled limitation instead of dropping a value; clients with ordered or multi-value APIs preserve every entry.
- Multipart text and file parts retain their original order. Python uses the clients' `files` tuple form even for text-only multipart bodies so `-F` is never downgraded to URL encoding.
- Browser generators reject local file references, and Fetch rejects GET/HEAD bodies that its runtime cannot represent.
- Multipart is generated only through stable client APIs. ureq currently reports it as unsupported because the crate exposes multipart under an explicitly unversioned module.
- Generated cURL currently targets POSIX shells. Null bytes and dynamic source expressions are rejected rather than approximated.

### Reverse-parser tradeoff

The reverse parser uses Babel's JavaScript/TypeScript parser for a mature ESTree-like AST without executing source. Its production browser chunk is independently lazy-loaded: the current measured build is about 95 KB gzip, while the initial converter code does not include it. Static literals, safe lexical `const` bindings, concatenation, template interpolation, Fetch, common Axios calls, `URLSearchParams`, generated `TextEncoder` bodies, and static `FormData` fields are supported. Imported runtime values, unknown mutations, custom serializers, and unresolved functions return structured limitations.

## Development

Requires Node.js 22 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

Quality gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Astro content collection owns the converter landing pages. Their examples
are generated from the real registry during the build. Social preview images
and PWA icons are committed static assets; regenerate them after adding a page
with `pnpm assets`.

Asset generation requires the local `rsvg-convert` command, but ordinary
installs and production builds do not.

## Public API direction

```ts
import { codeToCurl, convert, parseCurl, supportedTargets } from "curltocode";

const request = parseCurl("curl https://api.example.com/users");
const python = convert("curl https://api.example.com/users", {
  language: "python",
  client: "requests",
});
const curl = await codeToCurl('fetch("https://api.example.com/users")');
const targets = supportedTargets.map(({ language, client }) => ({
  language,
  client,
}));
```

Unsupported meaningful cURL options and dynamic source-code expressions produce typed, actionable errors rather than speculative output.

The package is not published yet. Production runtime exports point at `dist`; source is included for declarations during the pre-release workspace phase. A release milestone should decide whether the private core packages are published as dependencies or bundled into the public tarball.

## Adding a generator

Implement the shared `CodeGenerator` interface in `packages/generators`, register it in `registry.ts`, and add semantic tests for methods, headers, bodies, query parameters, authentication, cookies, escaping, and Unicode. The public target metadata and website selector derive from that registry; UI labels remain presentation concerns. Conversion logic must remain independent of UI packages.
