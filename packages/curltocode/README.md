# curltocode

The future public package for [CurlToCode](https://curltocode.com). It converts
cURL commands to 22 targets across JavaScript, TypeScript, Python, Go, PHP,
Java, C#, Ruby, and Rust. These include Fetch, Axios, Undici, Requests, HTTPX,
aiohttp, Resty, Guzzle, Apache HttpClient, RestSharp, Faraday, ureq, and each
language's existing standard or established client. It also statically parses
JavaScript and TypeScript Fetch/Axios source back to POSIX-shell cURL without
executing code or performing represented network requests.

```ts
import { codeToCurl, convert, parseCurl, supportedTargets } from "curltocode";

const request = parseCurl("curl https://api.example.com/users");
const python = convert("curl https://api.example.com/users", {
  language: "python",
  client: "requests",
});
const curl = await codeToCurl('fetch("https://api.example.com/users")');
const targetIds = supportedTargets.map(({ id }) => id);
```

`supportedTargets` is deterministic, read-only metadata sourced from the same
registry used for generation, so clients can build selectors without maintaining
a separate language/client allow list.

This package is not published yet.
