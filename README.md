# CurlToCode

CurlToCode is a local-first developer tool for converting cURL across 71 tested language, library, CLI, automation, and interchange-format targets, and reading 52 of them back into cURL with static parsers. The website is designed for `https://curltocode.com`; the `curltocode` workspace package is the future npm API.

## Supported conversions

- Browser JavaScript and TypeScript with Fetch, Axios, Undici, jQuery, and XMLHttpRequest
- Node.js with Fetch, Axios, Got, Ky, SuperAgent, and core HTTP/HTTPS
- Python Requests, HTTPX, aiohttp, http.client, and urllib3
- cURL to Go net/http and Resty v3
- PHP cURL, Guzzle, Symfony HttpClient, and Laravel HTTP
- Java HttpClient, OkHttp, Apache HttpClient 5, and HttpURLConnection
- C# HttpClient, RestSharp, and Flurl.Http
- Ruby Net::HTTP, Faraday, HTTParty, and rest-client
- cURL to Rust reqwest and ureq
- Kotlin, Swift, Dart, Objective-C, C, C++, Clojure, Elixir, Perl, R, Julia, Lua, MATLAB, OCaml, Scala, CFML, Nim, and Crystal
- PowerShell, HTTPie, Wget, raw HTTP, HAR, normalized JSON, Ansible, Postman, and k6
- Static reverse parsing for 52 targets across 20 languages and formats: JavaScript and TypeScript, Node.js, Python, PHP, Go, Java, Kotlin, C#, Ruby, Rust, Swift, Dart, PowerShell, HTTPie, Wget, raw HTTP, HAR, Postman, and normalized JSON

## Beyond conversion

- Paste a script of several cURL commands, or a HAR archive or Postman collection, and pick the request to convert from a list.
- Turn credentials in a generated cURL command into shell variables, so the command can be pasted somewhere public without the token going with it.
- Copy a share link that carries the request in the URL fragment, which browsers never send to a server.

Conversion is static. The project never executes cURL or pasted code, never contacts represented URLs, and does not persist raw converter input.

## Architecture

```text
cURL → shell tokenizer → cURL parser → HttpRequest → generator registry → code
code or request document → static source parser → HttpRequest → POSIX cURL generator
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

### Reverse-parser tradeoffs

JavaScript and TypeScript use Babel for a mature ESTree-like AST without executing source. Other programming languages use focused static tokenizers or syntax readers for the supported request shapes; command lines and interchange documents use format-specific parsers. The production reverse chunk is independently lazy-loaded, while the initial converter code does not include it. Imported runtime values, unknown mutations, custom serializers, shell substitutions, and unresolved functions return structured limitations rather than being executed or guessed.

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
with `pnpm assets`. The production build creates a content-revisioned service
worker that precaches the converter shell and lazy parser chunks, caches visited
pages, and falls back to the local converter when navigation happens offline.
Converter input is never placed in the cache or persisted.

Asset generation requires the local `rsvg-convert` command, but ordinary
installs and production builds do not.

## Cloudflare Workers Static Assets

The website is a fully static Astro build deployed through Workers Static
Assets. The root `wrangler.jsonc` points Wrangler at `apps/web/dist`; it has no
Worker entry point, server code, or runtime bindings. Requests are served
directly from Cloudflare's asset infrastructure, and converter input remains
entirely in the browser.

For a Git-connected Workers Builds project, configure the repository from its
root:

```text
Root directory: (leave blank)
Build command: pnpm run build
Deploy command: npx wrangler deploy
Production branch: main
```

Do not set the root directory to `/apps/web`: the root build first compiles the
three workspace packages consumed by the Astro app. Wrangler reads the static
asset output from `./apps/web/dist`, serves the generated `404.html` for missing
routes, and removes trailing slashes to match the site's canonical URLs.

Cloudflare reads Node.js `24` from `.node-version`. The exact pnpm release is
pinned through the root `packageManager` field. If the selected build image does
not honor that field, add `PNPM_VERSION=10.33.0` in the project build
environment.

To inspect the production build through the local Cloudflare runtime without
deploying it:

```bash
pnpm build
pnpm preview:cloudflare
```

To deploy manually after authenticating Wrangler:

```bash
pnpm build
pnpm deploy:cloudflare
```

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
