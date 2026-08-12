---
slug: curl-to-javascript
title: cURL to JavaScript – Fetch, Axios & Undici | CurlToCode
description: Convert cURL to JavaScript Fetch, Axios, or Node.js Undici code locally, preserving methods, bodies, headers, cookies, authentication, and queries.
heading: Convert cURL to JavaScript
eyebrow: Browser and Node.js requests
lede: Turn a cURL command into standards-based Fetch, Axios, or Node.js Undici code without ever sending the represented HTTP request.
language: javascript
client: fetch
languageLabel: JavaScript
clientLabel: Fetch
order: 20
faqs:
  - question: Should I use Fetch, Axios, or Undici?
    answer: Fetch is the portable built-in choice, Axios adds a broad convenience API, and Undici exposes a lower-level high-performance Node.js request API with ordered raw headers and dispatchers. Pick based on the runtime and surrounding code rather than conversion fidelity.
  - question: Why can't the converter handle curl -F with a file path?
    answer: Browser JavaScript has no filesystem access, so there is no honest way to turn /path/to/photo.png into a File object. The converter reports this rather than emitting code that looks correct but cannot work. Python, Go, PHP, Ruby, and Rust output can keep the path.
  - question: Why does the generated fetch include redirect manual?
    answer: Because cURL does not follow redirects unless you pass -L, while fetch follows them by default. Emitting redirect manual keeps the generated request behaving like the command you started from.
related:
  - curl-to-javascript/fetch
  - curl-to-javascript/axios
  - curl-to-javascript/undici
  - curl-to-typescript
---

## Fetch, Axios, or Undici

Fetch is built into current browsers and modern Node.js. Axios adds a dependency
but provides its own request configuration and response conventions, including
rejecting on HTTP error statuses rather than resolving with `ok: false`. Both
generators preserve the same normalized request semantics.

Undici is the Node-specific option. Its `request` API can preserve duplicate
headers through a flat ordered array and can retain local file references for
multipart or binary bodies, capabilities browser-oriented output cannot safely
claim.

One difference worth knowing: Axios has a native `auth` option, so basic
credentials are passed as a structured object rather than a precomputed
`Authorization` header. Fetch has no equivalent, so the header is built for you.

## Duplicate headers and forms

Fetch and Axios header containers can merge repeated names, so duplicate request
headers produce an explicit limitation instead of silently changing them.
URL-encoded forms keep `URLSearchParams` semantics as an exact encoded string,
while multipart text fields use `FormData`.

## JavaScript back to cURL

Switch directions to parse static Fetch and Axios calls. Literal URLs, objects,
templates without expressions, JSON bodies, and `URLSearchParams` are all
supported. A call such as `fetch(getUrl())` produces a precise dynamic-expression
limitation rather than a guess, because resolving it would require executing your
code.

## Common conversion issues

**A `GET` cannot carry a body.** The Fetch standard forbids it, so a command such
as `curl -X GET --data-raw ...` is rejected instead of producing code that throws
in the browser.

**`FormData` sets its own boundary.** If you copy a `Content-Type:
multipart/form-data; boundary=...` header from your browser's network tab, drop
it — the runtime replaces it, and keeping it breaks the request.

**Cookies from `-b` become a header, and browsers may refuse it.** `Cookie` is a
forbidden header name in browser fetch. The generated code is correct for Node.js
but a browser will strip it; use `credentials: "include"` with real cookies
instead.
