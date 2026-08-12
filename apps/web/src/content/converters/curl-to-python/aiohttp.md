---
slug: curl-to-python/aiohttp
parent: curl-to-python
title: cURL to Python aiohttp Converter | CurlToCode
description: Convert cURL commands to async Python aiohttp code with ClientSession, exact request bodies, ordered headers, redirects, authentication, and uploads.
heading: Convert cURL to Python aiohttp
eyebrow: Async Python HTTP
lede: Generate a complete asyncio program using aiohttp ClientSession, with file lifetimes and redirect behavior made explicit in the source.
language: python
client: aiohttp
languageLabel: Python
clientLabel: aiohttp
order: 13
faqs:
  - question: Is the generated aiohttp request asynchronous?
    answer: Yes. The output defines an async main function, opens a ClientSession with an async context manager, awaits the response body, and starts the program with asyncio.run.
  - question: Why are headers represented as a list of tuples?
    answer: A dictionary would lose repeated names. aiohttp accepts a sequence of pairs, so the generator can preserve duplicate header values and their order instead of silently replacing one.
  - question: Are uploaded files closed after the request?
    answer: Yes. File-backed bodies and multipart parts are registered with an ExitStack that remains open through the async request context and closes every handle afterwards.
related:
  - curl-to-python/requests
  - curl-to-python/httpx
  - curl-to-python
---

## Async request structure

The generated program uses one `aiohttp.ClientSession` and calls its generic
`request` method, so standard and extension HTTP methods share the same code
shape. Both the session and response are async context managers, ensuring pooled
connections are released even when reading the body raises.

`allow_redirects` is always written explicitly. aiohttp's defaults differ by
method, while cURL follows nothing unless `-L` is present; an explicit boolean
keeps the conversion independent of those defaults.

## Exact bodies and uploads

JSON is passed through `data=` as the original string rather than through
`json=`. That avoids re-serialization, preserving whitespace and key order for
signed or hashed bodies. URL-encoded forms are kept as their original encoded
byte sequence for the same reason.

Multipart requests use `aiohttp.FormData`. Text and file fields are appended in
order, while filename and content type metadata are carried on each file part.
`ExitStack` owns file handles across the awaited request, avoiding the common
mistake of closing a file before aiohttp has streamed it.

## Common aiohttp issues

**Do not set a multipart boundary yourself.** `FormData` creates it when the
request is serialized, so a copied `Content-Type` boundary would be stale.

**A session should normally outlive one request.** The self-contained snippet
creates one session for clarity. Applications making repeated calls should own a
session at the service or application level.

**Response methods are coroutines.** `response.text()` must be awaited; printing
the coroutine object does not consume the body or release the connection.
