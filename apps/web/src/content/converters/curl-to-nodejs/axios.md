---
slug: curl-to-nodejs/axios
parent: curl-to-nodejs
title: cURL to Node.js Axios Converter | CurlToCode
description: Convert cURL commands to Node.js Axios configuration with exact request bodies, streamed files, structured basic authentication, and redirect parity.
heading: Convert cURL to Node.js Axios
eyebrow: Axios on the Node runtime
lede: Generate an Axios request for Node services, with file streams and an explicit redirect budget that matches the original cURL command.
language: nodejs
client: axios
languageLabel: Node.js
clientLabel: Axios
order: 292
faqs:
  - question: Why does the output set maxRedirects to zero?
    answer: Axios follows redirects in Node by default, while cURL only does so with -L. A zero budget preserves the default cURL behaviour; an -L command gets Axios's normal finite redirect budget instead.
  - question: How are file bodies handled by Axios?
    answer: Raw file bodies use createReadStream so a large payload is not buffered in memory. Multipart files are added through a FormData-compatible body with their path, filename, and content type preserved.
  - question: Why is basic authentication not an Authorization header?
    answer: Axios has a native auth object for username and password. Using it delegates the encoding to Axios and keeps credentials structured, while bearer authentication remains an explicit header because it has no equivalent option.
related:
  - curl-to-nodejs
  - curl-to-nodejs/fetch
  - curl-to-nodejs/got
  - curl-to-javascript/axios
---

## Axios configuration for Node

The generated source imports Axios and supplies one configuration object with
the URL, lowercase method, headers, data, and redirect budget. This shape works
for every verb instead of switching between `axios.get`, `axios.post`, and their
different positional arguments.

Node file bodies are streamed with `createReadStream`. That keeps memory usage
bounded for large uploads and is a material advantage over turning the whole
file into a `Buffer` before the request starts.

## Redirects and status errors

Axios's Node adapter follows redirects, whereas cURL requires `-L`. The output
sets `maxRedirects: 0` for a command without that flag and uses a finite normal
budget for a command that opted in. The policy is visible and deterministic.

Axios rejects its promise for many non-2xx statuses. That is a response-handling
difference rather than a change to the request on the wire, so the converter
does not wrap the call in an application-specific `try` block. Account for it
when integrating the generated snippet.

## Headers, auth, and request bytes

Basic credentials become Axios's `auth` object. Cookies and bearer tokens are
headers because Node is allowed to set them directly. Serialized JSON, form, and
text bodies are passed as the exact source bytes; Axios is not asked to
re-serialize an already complete payload.

Axios accepts request headers as an object, which means duplicate keys cannot be
represented. CurlToCode reports that conflict. For intentionally repeated
headers, use [node:http or node:https](/curl-to-nodejs/https).

Install Axios with `npm install axios`.
