---
slug: curl-to-javascript/undici
parent: curl-to-javascript
title: cURL to JavaScript Undici Converter | CurlToCode
description: Convert cURL commands to Node.js Undici request code, including headers, raw bodies, authentication, cookies, redirects, and multipart file uploads.
heading: Convert cURL to JavaScript Undici
eyebrow: Node.js Undici client
lede: Generate Node-focused Undici request code with ordered headers, explicit redirect policy, response-body consumption, and filesystem-aware uploads.
language: javascript
client: undici
languageLabel: JavaScript
clientLabel: Undici
order: 23
faqs:
  - question: When should I choose Undici instead of the built-in fetch function?
    answer: Choose Undici when the code runs on Node.js and you want direct access to its high-performance request API, dispatcher composition, connection pooling, and ordered raw headers. Use Fetch when the same source must also run in a browser.
  - question: Why does the output always read the response body?
    answer: Undici requires response bodies to be consumed or destroyed so its connection can return to the pool. The generated example calls responseBody.text explicitly instead of leaving a pooled connection occupied.
  - question: How does the generator preserve repeated request headers?
    answer: The request API accepts a flat header array, so every name and value is emitted in order. That representation can carry repeated names without collapsing them into an object key.
related:
  - curl-to-javascript/fetch
  - curl-to-javascript/axios
  - curl-to-typescript
---

## Why use Undici directly

Node's Fetch implementation is powered by Undici, but the package's `request`
API exposes a lower-level interface that is useful for services and command-line
programs. It accepts an explicit method, ordered header pairs, a body, and an
optional dispatcher without introducing browser-only restrictions.

The generator imports `request` from `undici` and prints both the status and
body. When the original command uses `-L`, it composes an `Agent` with the
redirect interceptor; otherwise no redirect interceptor is installed, matching
cURL's default.

## Node files and multipart bodies

Unlike browser Fetch, Undici code can retain cURL file references. A binary
`@file` body becomes `readFile(path)`. Multipart files become `Blob` instances
created from those bytes and are appended to Undici's own `FormData` class with
the original filename and media type.

The multipart boundary is owned by `FormData`. An explicit multipart
`Content-Type` copied from another request cannot safely be reused because its
boundary would no longer match the generated body.

## Important Undici constraints

**`CONNECT` is not handled by `request`.** Undici provides separate dispatcher
mechanisms for tunnels, so the converter reports this method instead of emitting
a normal request call that would fail.

**`Expect` is unsupported.** If the cURL command sets that header, conversion
stops with an explicit limitation.

**A dispatcher should be reused in production.** The snippet creates and closes
one to make redirect behavior self-contained. A long-running service should
usually create an `Agent` once and share it across requests.
