---
slug: curl-to-nodejs/superagent
parent: curl-to-nodejs
title: cURL to Node.js SuperAgent Converter | CurlToCode
description: Convert cURL commands to fluent SuperAgent code with multipart attachments, streamed file bodies, basic auth, explicit redirects, and status handling.
heading: Convert cURL to Node.js SuperAgent
eyebrow: Fluent Node request API
lede: Generate SuperAgent chains with native field, attachment, authentication, redirect, and response-status behaviour made explicit.
language: nodejs
client: superagent
languageLabel: Node.js
clientLabel: SuperAgent
order: 295
faqs:
  - question: How are multipart files represented in SuperAgent?
    answer: Text parts become field calls and file parts become attach calls carrying the path, posted filename, and optional content type. SuperAgent creates the multipart boundary, so a stale Content-Type boundary is not copied.
  - question: Why does the generated chain call ok with a function?
    answer: SuperAgent rejects its promise for non-success HTTP responses by default, while cURL normally exposes those responses. The generated predicate accepts every status so the caller can inspect the result directly.
  - question: Can a large raw file be streamed?
    answer: Yes. A file supplied with --data-binary is piped from createReadStream into the request rather than read into one Buffer, keeping memory use bounded.
related:
  - curl-to-nodejs
  - curl-to-nodejs/axios
  - curl-to-nodejs/got
  - curl-to-nodejs/https
---

## Fluent request construction

SuperAgent starts with the method and URL, then adds headers, authentication,
redirect policy, body, and multipart parts through chained calls. This maps well
to cURL's independent options while remaining idiomatic SuperAgent.

Basic credentials use `.auth(user, password)`. Multipart text fields use
`.field`, and files use `.attach` with the submitted filename and MIME type.
SuperAgent owns the boundary, so the generator removes any copied multipart
`Content-Type` header that would conflict with it.

## Statuses and redirects

The `.ok(() => true)` predicate is deliberate. SuperAgent normally rejects on
an HTTP error status; cURL normally makes the response available. Accepting all
statuses preserves that part of the command's behaviour without hiding network
errors.

`.redirects(0)` represents a command without `-L`. A following command gets
SuperAgent's finite normal redirect budget. Unlike the core Node modules, the
client can express both states.

## Streaming and limitations

A raw file body is piped from `createReadStream` into the request. Multipart
uploads use SuperAgent's own streaming machinery. No file is touched while the
conversion runs in the browser; the path appears only in the generated source.

SuperAgent writes headers through a name-keyed interface, so a later value
replaces an earlier value with the same name. CurlToCode rejects repeated names
rather than silently applying that replacement.

Install SuperAgent with `npm install superagent`.
