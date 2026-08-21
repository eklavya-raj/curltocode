---
slug: curl-to-nodejs/got
parent: curl-to-nodejs
title: cURL to Node.js Got Converter | CurlToCode
description: Convert cURL commands to Got code for Node.js with retries disabled, HTTP errors exposed, explicit redirects, headers, bodies, auth, and file streams.
heading: Convert cURL to Node.js Got
eyebrow: Policy-rich Node HTTP client
lede: Generate Got requests whose retry, redirect, and HTTP-error policies are adjusted to preserve cURL's one-request semantics.
language: nodejs
client: got
languageLabel: Node.js
clientLabel: Got
order: 293
faqs:
  - question: Why does the Got output disable retries?
    answer: Got retries selected failures by default, but one cURL command represents one request attempt. Setting retry limit to zero prevents a converted request from unexpectedly reaching an endpoint more than once.
  - question: Why is throwHttpErrors set to false?
    answer: cURL normally returns the response body for a 404 or 500 instead of treating the status as a network failure. Disabling Got's HTTP-status exception keeps that response available to the generated code.
  - question: Does Got support local files?
    answer: Yes. The Node target uses streams for raw file bodies and builds multipart data from the path, filename, and media type in the cURL command, without uploading or reading anything during conversion.
related:
  - curl-to-nodejs
  - curl-to-nodejs/ky
  - curl-to-nodejs/axios
  - curl-to-nodejs/superagent
---

## Neutralizing Got's convenience defaults

Got deliberately does more than cURL: it retries selected failures, follows
redirects, and throws for HTTP error statuses. Those defaults are useful in many
applications, but leaving them implicit would alter a converted request.

The generated options set `retry: { limit: 0 }` and
`throwHttpErrors: false`. `followRedirect` mirrors `-L` directly. As a result, a
single command makes one attempt and exposes whatever response the server sent.

## Bodies and files

Serialized JSON, text, and form bodies use Got's `body` option rather than its
`json` or `form` helpers. The command already contains serialized bytes, and
passing them through another serializer can change the payload.

Because this target runs in Node, file-backed data uses filesystem streams and
multipart parts keep their filename and media type. Conversion itself remains a
static transformation: the file is only opened if the generated program is run.

## Headers and integration

Authentication and cookies are materialized into headers. Got's header option is
object-shaped, so repeated names cannot be represented without folding them;
the converter surfaces that limitation instead of guessing whether folding is
safe for a particular header.

The output logs `response.body`, a string in the generated configuration. Adapt
response parsing to the API you call, but retain the explicit retry and error
options unless changing the original command's behaviour is intentional.

Install Got with `npm install got`.
