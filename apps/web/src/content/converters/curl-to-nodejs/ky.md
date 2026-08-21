---
slug: curl-to-nodejs/ky
parent: curl-to-nodejs
title: cURL to Node.js Ky Converter | CurlToCode
description: Convert cURL commands to Node.js Ky code with retries and status throwing disabled, redirect parity, exact bodies, headers, and local file uploads.
heading: Convert cURL to Node.js Ky
eyebrow: Small Fetch-based Node client
lede: Generate compact Ky code while making its retry and HTTP-error behaviour match the single request represented by cURL.
language: nodejs
client: ky
languageLabel: Node.js
clientLabel: Ky
order: 294
faqs:
  - question: Why use Ky instead of the built-in Fetch API?
    answer: Ky wraps Fetch with hooks, retry controls, timeout options, and convenience response methods. Use it when those facilities already fit the application; use built-in Fetch when avoiding a dependency is more important.
  - question: Why are retry and throwHttpErrors changed?
    answer: Ky retries selected requests and throws for non-success statuses by default. cURL does neither for an ordinary command, so retry is set to zero and HTTP status throwing is disabled in generated code.
  - question: Does the Ky target work with multipart file paths?
    answer: Yes in Node.js. It opens local files through Node's filesystem APIs and appends them to FormData. The browser JavaScript targets cannot resolve arbitrary local paths and correctly reject the same input.
related:
  - curl-to-nodejs
  - curl-to-nodejs/got
  - curl-to-nodejs/fetch
  - curl-to-nodejs/axios
---

## A Fetch wrapper with explicit policy

Ky retains Fetch's URL and options model while adding application-level
conveniences. The generated request therefore looks familiar, but includes two
important lines: `retry: 0` and `throwHttpErrors: false`.

Without them, a converted idempotent request could be sent again after a
transient failure, and a 404 response would be thrown rather than returned.
Those are useful Ky features when selected intentionally, not faithful defaults
for a cURL conversion.

## Request bodies in Node

JSON, form, text, and inline binary data are provided as their existing bytes.
File-backed input and multipart parts use Node filesystem APIs, so the generated
program can refer to the same paths as the shell command.

Ky is Fetch-based and shares its restriction on bodies for `GET` and `HEAD`.
When cURL has been forced into that combination, the generator reports the
incompatibility instead of returning source that fails during execution.

## Redirects and headers

Ky inherits Fetch's follow-redirect default. A command without `-L` gets
`redirect: "manual"`; a command with it uses the normal follow behaviour.
Header values are materialized explicitly, including cookies and authorization.

Its object-shaped headers cannot preserve duplicate names. Use the
[core Node target](/curl-to-nodejs/https) for repeated values, or revise the
request only when the receiving API documents an equivalent combined form.

Install Ky with `npm install ky`.
