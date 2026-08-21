---
slug: curl-to-nodejs/fetch
parent: curl-to-nodejs
title: cURL to Node.js Fetch Converter | CurlToCode
description: Convert cURL commands to Node.js Fetch code with explicit redirect handling, exact bodies, authentication headers, and local multipart file uploads.
heading: Convert cURL to Node.js Fetch
eyebrow: Built-in Node Fetch API
lede: Generate dependency-free Fetch code for current Node.js, including real local-file uploads through the Node filesystem APIs.
language: nodejs
client: fetch
languageLabel: Node.js
clientLabel: Fetch
order: 291
faqs:
  - question: Does the generated Node.js Fetch code need a package?
    answer: No. Current Node.js releases expose fetch globally. A multipart upload uses openAsBlob from node:fs, which is also built in, so the snippet does not need node-fetch, form-data, or another dependency.
  - question: Why is redirect set to manual?
    answer: Fetch follows redirects by default while cURL does not follow them without -L. The generated manual policy aligns those behaviours; when -L is present, Fetch's normal follow policy is allowed instead.
  - question: Can Node.js Fetch preserve repeated header names?
    answer: Not reliably through its Headers model, which combines some repeated values. The converter reports duplicate names rather than silently changing the bytes a server receives. Use the core node:https target when repeats matter.
related:
  - curl-to-nodejs
  - curl-to-nodejs/axios
  - curl-to-nodejs/https
  - curl-to-javascript/fetch
---

## The built-in choice

Node's global `fetch` uses the same request shape as browser Fetch, which makes
it a good default when code needs to move between runtimes. The generated call
keeps the method explicit and logs the response text after awaiting it. No import
or install command is needed for an ordinary request.

Node's runtime capability changes file handling. Multipart file parts are opened
with `openAsBlob` and appended to `FormData`; a binary file body is represented
as a filesystem-backed value rather than an invented browser `File` object.

## Exact bodies and redirect policy

JSON and form bodies are emitted from their original serialized text. Parsing
and stringifying JSON would be prettier in some cases, but could change spacing,
key order, or number spelling. Keeping the bytes is the faithful conversion.

`redirect: "manual"` is included when the cURL command omitted `-L`. That line
may look unnecessary, but removing it changes which requests are sent after a
3xx response. With `-L`, the option disappears because Fetch's follow default is
the requested behaviour.

## Limits worth seeing

Fetch does not permit a body on `GET` or `HEAD`, even though cURL can be forced
to send one. The generator rejects that combination before producing code that
would throw at runtime.

Repeated header names are also reported. A Fetch `Headers` collection may fold
values together, which is not equivalent for every header. If duplicates are a
requirement, [the core Node target](/curl-to-nodejs/https) uses array-valued
headers and preserves them.
