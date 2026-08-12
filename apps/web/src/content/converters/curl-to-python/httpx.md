---
slug: curl-to-python/httpx
parent: curl-to-python
title: cURL to Python HTTPX Converter | CurlToCode
description: Convert cURL commands to Python HTTPX code in your browser, with correct handling of JSON bodies, forms, multipart uploads, cookies, and basic auth.
heading: Convert cURL to Python HTTPX
eyebrow: httpx library
lede: Generate code for HTTPX specifically, using its own argument names for raw content, redirects, and authentication.
language: python
client: httpx
languageLabel: Python
clientLabel: HTTPX
order: 12
faqs:
  - question: How does HTTPX differ from requests in the generated code?
    answer: Two arguments are renamed. A raw body goes to content= rather than data=, and redirects are controlled by follow_redirects= rather than allow_redirects=. Everything else, including headers, cookies, and the auth tuple, looks the same.
  - question: Can I make this code async?
    answer: Yes. Replace the module-level call with an httpx.AsyncClient inside an async with block and await the request. The arguments are identical, which is the main reason to pick HTTPX over requests for new code.
  - question: Does HTTPX support HTTP/2?
    answer: Yes, but not by default. Install it with the http2 extra and construct a client with http2 enabled. The generated snippets use the module-level API, which is HTTP/1.1.
related:
  - curl-to-python/requests
  - curl-to-python
  - curl-to-rust
---

## HTTPX-specific output

HTTPX mirrors the requests API closely enough that most code reads the same, but
the differences are deliberate rather than cosmetic. `content=` exists precisely
to distinguish raw bytes from a form or JSON payload, which requests overloads
onto a single `data=` argument.

The generated code uses the module-level convenience functions. Each one creates
a client, issues the request, and closes it, which is convenient for a snippet
but wasteful in a loop.

## Uploads and forms

Multipart requests use the `files` argument in the same tuple-list form as
requests, so file parts keep their posted filename and media type, and repeated
field names are preserved.

## Common conversion issues

**Use a client for more than one request.** `httpx.get` and friends open and
close a connection every call. An `httpx.Client` (or `AsyncClient`) reuses
connections and is markedly faster for repeated calls.

**`follow_redirects` defaults to False in HTTPX.** This actually matches cURL,
unlike requests. The generated code still writes it out so the intent is visible
in review.

**Timeouts are on by default.** HTTPX applies a five-second default timeout where
requests waits indefinitely. A conversion that works under cURL may raise
`ReadTimeout` here; pass an explicit `timeout=` if your endpoint is slow.
