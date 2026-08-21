---
slug: curl-to-r/httr
parent: curl-to-r
title: cURL to R httr Converter | CurlToCode
description: Convert cURL to R httr VERB calls with add_headers, authenticate, raw or multipart bodies, upload_file, content types, and an explicit followlocation config.
heading: Convert cURL to R httr
eyebrow: Established R HTTP client
lede: Generate httr code in the VERB form used across published analysis scripts, with the encoding and redirect policy stated rather than defaulted.
language: r
client: httr
languageLabel: R
clientLabel: httr
order: 962
faqs:
  - question: Why does the output use VERB instead of GET or POST?
    answer: VERB takes the method as a string, so a custom verb is written the same way as a standard one and the generated shape does not change with the method.
  - question: What does the raw encoding mean here?
    answer: It tells httr to send the supplied bytes as they are. The other encodings re-serialize the payload, which can change what actually reaches the server.
  - question: Can httr send the same header name twice?
    answer: No. add_headers collects headers by name, so the converter reports a repeated name instead of quietly dropping one of the two values.
related:
  - curl-to-r
  - curl-to-r/httr2
  - curl-to-matlab
  - curl-to-python
---

## The VERB form

httr is still what most published R analysis code and many CRAN packages use.
The generator emits `VERB` rather than the per-method helpers, because `VERB`
accepts the method as a string and therefore covers extension verbs that have no
helper of their own.

Headers go through `add_headers` with backtick-quoted labels, credentials
through `authenticate`, and the redirect policy through
`config(followlocation = ...)`.

## Bodies and uploads

A textual body is sent with `encode = "raw"` and an explicit `content_type`,
so the payload is not re-serialized on the way out. A `--data-binary @file`
body uses `upload_file` with the declared type.

Multipart input becomes a `body = list(...)` with `encode = "multipart"`.
File entries use `upload_file`, carrying the path and, when cURL declared one,
the part media type.

## Choosing between httr and httr2

httr is not deprecated, but it is in maintenance. If the code is new, prefer
[httr2](/curl-to-r/httr2); if you are pasting into an existing script or package
that already loads httr, this page is the one to use.

Install with `install.packages("httr")`.
