---
slug: curl-to-r/httr2
parent: curl-to-r
title: cURL to R httr2 Converter | CurlToCode
description: Convert cURL to R httr2 pipelines with req_headers, basic auth, raw and multipart bodies, uploaded files, followlocation, and non-2xx responses kept usable.
heading: Convert cURL to R httr2
eyebrow: Current tidyverse HTTP client
lede: Generate a piped httr2 request where the method, headers, body, redirect policy, and error handling each appear as their own named step.
language: r
client: httr2
languageLabel: R
clientLabel: httr2
order: 961
faqs:
  - question: Why does the generated pipeline disable httr2 error raising?
    answer: httr2 turns a non-2xx response into an R condition by default, while cURL prints whatever came back. req_error keeps a 404 or a 500 available as an ordinary response.
  - question: How are header names containing hyphens handled?
    answer: They become backtick-quoted argument labels, so a name such as X-Request-Id reaches req_headers unchanged rather than being converted into a syntactic R name.
  - question: Does httr2 re-encode a JSON body?
    answer: No. The bytes from the cURL command go to req_body_raw with the original content type, so key order and formatting reach the server exactly as pasted.
related:
  - curl-to-r
  - curl-to-r/httr
  - curl-to-python/requests
  - curl-to-julia
---

## A request built as a pipeline

httr2 starts from `request(url)` and adds one step at a time. The generated
code follows that shape: `req_method`, then `req_headers`, then
`req_auth_basic` when the command used `-u`, then a body step, then
`req_options` and `req_error`.

Reading down the pipe gives you the whole request in the order cURL described
it, which is the main reason httr2 is preferred over httr for new code.

## Bodies keep their bytes

`req_body_raw` receives the payload exactly as pasted, together with the
declared content type. A `--data-binary @file` body uses `req_body_file`, and
multipart input uses `req_body_multipart` with `curl::form_file` values that
carry the path, the posted filename, and the part media type.

Nothing is handed to an R serializer on the way. `req_body_json` would encode
an R list, which is a different request from the one in the command.

## Two things stated rather than defaulted

**Redirects.** `req_options(followlocation = ...)` is written from the `-L`
state, so the underlying libcurl handle cannot decide on its own.

**Errors.** `req_error(is_error = function(resp) FALSE)` is emitted because
cURL prints an error body; httr2 would otherwise abort before you see it.

Install with `install.packages("httr2")`.

## Repeated header names are refused

`req_headers` collects headers by name. Rather than guess whether two values
should be joined with a comma or one should win, the converter reports the
repeated name and declines.
