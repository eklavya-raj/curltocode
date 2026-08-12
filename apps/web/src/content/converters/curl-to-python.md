---
slug: curl-to-python
title: cURL to Python – Requests, HTTPX & aiohttp | CurlToCode
description: Convert cURL to Python Requests, HTTPX, or async aiohttp code locally, including exact bodies, forms, headers, authentication, cookies, and uploads.
heading: Convert cURL to Python
eyebrow: Python HTTP clients
lede: Generate Requests, HTTPX, or async aiohttp code while preserving methods, queries, headers, authentication, cookies, and request bodies.
language: python
client: requests
languageLabel: Python
clientLabel: Requests
order: 10
faqs:
  - question: Should I use Requests, HTTPX, or aiohttp?
    answer: Requests is the established synchronous default, HTTPX offers closely related sync and async APIs plus HTTP/2, and aiohttp is an asyncio-native client with mature streaming and session support. Use the client already aligned with your application's concurrency model.
  - question: Why does the converter refuse duplicate header names?
    answer: Both clients take headers as a dictionary, which cannot hold the same key twice. Rather than silently drop one of them and change what your server receives, the converter reports the limitation so you can decide how to handle it.
  - question: Why is my JSON body sent with data= instead of json=?
    answer: Using json= would re-serialize the value and could reorder keys or change whitespace. Passing the original bytes through data= guarantees the server receives exactly what cURL would have sent, which matters for signed request bodies.
related:
  - curl-to-python/requests
  - curl-to-python/httpx
  - curl-to-python/aiohttp
  - curl-to-javascript
---

## Requests, HTTPX, and aiohttp output

Choose Requests for the familiar synchronous Python API, or HTTPX for a modern
client with a closely related interface. CurlToCode emits the required import and
keeps dependency installation separate from the generated source, so you can copy
the code without copying a shell command into it.

The two clients differ in small but real ways. Requests uses `allow_redirects`
where HTTPX uses `follow_redirects`, and a raw body goes to `data=` on Requests
but `content=` on HTTPX. The generated code uses whichever is correct for the
client you picked.

aiohttp produces a complete `asyncio.run` program with nested async context
managers. It uses a list of header pairs to retain repeated names and an
`ExitStack` to keep uploaded files open until the awaited request finishes.

## Forms, authentication, and files

URL-encoded form pairs keep their order and their exact encoded bytes. Basic
credentials use each client's `auth` argument rather than a hand-built header, so
the library performs the base64 encoding.

Multipart file references become explicit binary `open(..., "rb")` calls. A
field-only `-F` request still produces a multipart body rather than a form, using
a `None` filename to force multipart encoding — that detail is easy to get wrong
by hand.

## Common conversion issues

**A browser file reference and a filesystem path are not interchangeable.**
Python output can keep a cURL `@file` reference as a local file open, because
Python has filesystem access. Browser JavaScript output reports that as a
limitation instead of inventing a `File` object.

**Redirects are off by default in cURL and on by default in both Python
clients.** The generated code always states the value explicitly so the
difference cannot bite you silently.

**Duplicate cookies are rejected, not merged.** A cookie mapping cannot hold two
values for one name, so the converter surfaces the conflict rather than picking a
winner.
