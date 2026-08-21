---
direction: code-to-curl
slug: nodejs-to-curl/https
parent: nodejs-to-curl
title: node:https to cURL Converter | CurlToCode
description: Convert a node:https or node:http request into a cURL command, reading its options object and the chunks written to the request stream, duplicate headers included.
heading: Convert node:https to a cURL command
eyebrow: Core module parser
lede: Read the core module underneath every Node HTTP client, where the payload is whatever was written to the request stream.
language: nodejs
client: https
languageLabel: Node.js
clientLabel: node:https
order: 1156
faqs:
  - question: How is the request body recovered?
    answer: From the write calls made on the request object, joined in source order. A chunk the reader cannot resolve stops the conversion rather than producing a partial body.
  - question: Can a repeated header name survive?
    answer: Yes. The core module takes an array of strings per header name, which is the only Node client that can send the same field twice, and the array is read back as two headers.
  - question: Why is the command never given -L?
    answer: Neither node:http nor node:https follows redirects. A 3xx has to be re-requested by hand, so the command reflects a request that stops at the first response.
related:
  - nodejs-to-curl
  - nodejs-to-curl/fetch
  - curl-to-nodejs/https
  - http-to-curl
---

## Not a client, a connection

`request(url, options, callback)` returns a writable stream. There is no body
option, so the payload is whatever the code wrote before calling `end`. The
reader collects those `write` calls in source order and joins them, which is
also how a hand-written multipart message comes back as its fields.

Both the named import and the namespace form are followed, under the bare and
the `node:` specifiers.

## Headers

The options object takes a string or an array of strings per name. The array
form is how the core module sends the same field twice, and it is read back as
two separate headers rather than as one comma-joined value.

## Multipart written by hand

When the declared content type carries a boundary, the joined payload is split
back into its parts. A part carrying a file's bytes rather than its path is
refused: there is no path left to put in a `-F` option, and inventing one
would describe a different request.
