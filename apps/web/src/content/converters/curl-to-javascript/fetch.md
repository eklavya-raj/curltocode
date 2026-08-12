---
slug: curl-to-javascript/fetch
parent: curl-to-javascript
title: cURL to Fetch Converter – JavaScript | CurlToCode
description: Convert cURL commands to JavaScript Fetch code in your browser, with correct redirect mode, header handling, form bodies, and FormData for multipart fields.
heading: Convert cURL to Fetch
eyebrow: Standard Fetch API
lede: Generate a dependency-free fetch call that runs unchanged in browsers, Node.js 18 and later, Deno, Bun, and edge runtimes.
language: javascript
client: fetch
languageLabel: JavaScript
clientLabel: Fetch
order: 21
faqs:
  - question: Why does the generated call include redirect manual?
    answer: fetch follows redirects by default; cURL does not unless you pass -L. Setting redirect to manual keeps the generated request behaving like your original command. When the command did include -L, the option is omitted and the default applies.
  - question: Does fetch throw on a 404 or 500?
    answer: No. It only rejects on a network failure. A 404 resolves normally with ok set to false, which is the most common surprise when moving from a client like Axios. Check response.ok yourself.
  - question: Why is my Cookie header ignored in the browser?
    answer: Cookie is a forbidden header name, so browsers strip it from fetch requests. The generated code is correct for Node.js and other server runtimes. In a browser, rely on real cookies with credentials set to include instead.
related:
  - curl-to-javascript/axios
  - curl-to-javascript
  - curl-to-typescript
---

## Fetch-specific output

The generated code builds a single `fetch` call with an init object. The method
is omitted when it is a plain `GET` with no body, because that is already the
default and including it adds noise.

Headers are emitted as a plain object literal rather than a `Headers` instance.
Both are accepted by fetch, but an object literal is easier to read and to edit
afterwards.

## Bodies

A JSON body is emitted as `JSON.stringify` over a real object literal whenever
the original bytes round-trip exactly. If your command contained JSON with
unusual whitespace or key ordering, the raw string is emitted instead so the
bytes are preserved rather than normalized.

Form bodies are passed as an encoded string rather than a `URLSearchParams`
instance, which keeps the exact encoding cURL produced. Multipart text fields use
`FormData`, built up with `append` calls before the request.

## Common conversion issues

**A `GET` request cannot have a body.** The Fetch standard forbids it and the
runtime throws. The converter rejects that combination rather than emitting code
that fails at execution.

**Do not set `Content-Type` with `FormData`.** The runtime generates a boundary
and sets the header itself. A copied `multipart/form-data` header with a stale
boundary is one of the most common causes of a server rejecting an upload.

**Duplicate header names are rejected.** A plain object cannot hold the same key
twice, and a `Headers` instance joins repeated values with a comma. Rather than
change what your server receives, the converter reports the conflict.
