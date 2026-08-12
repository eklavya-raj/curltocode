---
slug: curl-to-javascript
title: cURL to JavaScript Converter – Fetch & Axios | CurlToCode
description: Convert cURL to JavaScript Fetch or Axios code in your browser. Preserve JSON, forms, headers, cookies, authentication, and query parameters exactly.
heading: Convert cURL to JavaScript
eyebrow: Browser and Node.js requests
lede: Turn a cURL command into standards-based Fetch or an Axios request without ever sending the represented HTTP request.
language: javascript
client: fetch
languageLabel: JavaScript
clientLabel: Fetch
order: 20
faqs:
  - question: Should I use Fetch or Axios?
    answer: Fetch is built into every current browser and into Node.js 18 and later, so it needs no dependency. Axios adds one but gives you interceptors, automatic JSON parsing, and errors that reject on non-2xx responses. Both generators preserve identical request semantics.
  - question: Why can't the converter handle curl -F with a file path?
    answer: Browser JavaScript has no filesystem access, so there is no honest way to turn /path/to/photo.png into a File object. The converter reports this rather than emitting code that looks correct but cannot work. Python, Go, PHP, Ruby, and Rust output can keep the path.
  - question: Why does the generated fetch include redirect manual?
    answer: Because cURL does not follow redirects unless you pass -L, while fetch follows them by default. Emitting redirect manual keeps the generated request behaving like the command you started from.
related:
  - curl-to-javascript/fetch
  - curl-to-javascript/axios
  - curl-to-typescript
---

## Fetch or Axios

Fetch is built into current browsers and modern Node.js. Axios adds a dependency
but provides its own request configuration and response conventions, including
rejecting on HTTP error statuses rather than resolving with `ok: false`. Both
generators preserve the same normalized request semantics.

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
