---
slug: curl-to-nodejs/https
parent: curl-to-nodejs
title: cURL to Node.js HTTPS Converter | CurlToCode
description: Convert cURL to dependency-free node:http or node:https request code with streamed bodies, repeated headers, multipart framing, auth, and cookies.
heading: Convert cURL to Node.js HTTPS
eyebrow: Core node:http and node:https
lede: Generate low-level dependency-free Node code that preserves repeated headers and streams files, with unsupported redirect following reported clearly.
language: nodejs
client: https
languageLabel: Node.js
clientLabel: node:http / node:https
order: 296
faqs:
  - question: Does this target always import node:https?
    answer: No. It imports node:https for an HTTPS URL and node:http for a plain HTTP URL. The APIs have the same request shape, but the HTTPS module cannot be used as a transparent replacement for the HTTP protocol.
  - question: Can the core modules follow redirects?
    answer: They return the 3xx response and leave any follow-up request to application code. Because -L cannot be represented by one native option, the converter reports it rather than pretending redirect following was preserved.
  - question: Why can this target keep repeated headers?
    answer: Node's request options accept an array of values for a header name. The generator groups repeated names into that array, avoiding the overwrite or comma-folding that an ordinary JavaScript object would cause.
related:
  - curl-to-nodejs
  - curl-to-nodejs/fetch
  - curl-to-nodejs/superagent
  - curl-to-http
---

## No dependency and no hidden policy

This target uses Node's core `request` function. It selects `node:http` or
`node:https` from the URL scheme and wires the response stream into a list of
chunks before printing the resulting text.

The lower-level API is verbose, but it has no dependency defaults for retries or
HTTP-status throwing. It also exposes header arrays and request streams directly,
which makes it one of the most faithful Node targets for unusual requests.

## Repeated headers and bodies

When a header name occurs more than once, the options object receives an array
of its ordered values. Node accepts that representation and sends each value;
object-oriented client wrappers generally cannot do so without folding.

Inline bodies are written with `req.write`. A file body uses
`createReadStream(...).pipe(req)`, which also ends the request after the stream
finishes. Multipart output writes deterministic boundaries and reads each file
part only when the generated program runs.

## Redirect limitation

The core modules do not have a follow-redirect option. Implementing `-L` would
require response handling that resolves `Location`, selects the next method,
handles cross-origin credentials, and enforces a loop limit. A superficial
retry would be unsafe.

For that reason, a cURL command containing `-L` produces a controlled
limitation. Choose [Node.js Fetch](/curl-to-nodejs/fetch), Axios, Got, Ky, or
SuperAgent when redirect following is required.

## Error handling

The generated request subscribes to its `error` event so transport failures do
not become unhandled process errors. HTTP 4xx and 5xx responses arrive through
the normal callback, matching cURL's default distinction between a completed
HTTP exchange and a network failure.
