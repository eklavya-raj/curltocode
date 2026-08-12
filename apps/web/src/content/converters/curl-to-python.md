---
slug: curl-to-python
title: cURL to Python Converter – Requests & HTTPX | CurlToCode
description: Convert cURL commands to idiomatic Python Requests or HTTPX code locally in your browser, including JSON, forms, headers, authentication, and cookies.
heading: Convert cURL to Python
eyebrow: Python HTTP clients
lede: Generate readable Requests or HTTPX code while preserving methods, query parameters, headers, authentication, cookies, and request bodies.
language: python
client: requests
languageLabel: Python
clientLabel: Requests
order: 10
faqs:
  - question: Should I use Requests or HTTPX?
    answer: Requests is the long-standing synchronous default and is present in most existing codebases. HTTPX offers a nearly identical API plus async support and HTTP/2. The generated code differs in only a few argument names, so switching later is cheap.
  - question: Why does the converter refuse duplicate header names?
    answer: Both clients take headers as a dictionary, which cannot hold the same key twice. Rather than silently drop one of them and change what your server receives, the converter reports the limitation so you can decide how to handle it.
  - question: Why is my JSON body sent with data= instead of json=?
    answer: Using json= would re-serialize the value and could reorder keys or change whitespace. Passing the original bytes through data= guarantees the server receives exactly what cURL would have sent, which matters for signed request bodies.
related:
  - curl-to-python/requests
  - curl-to-python/httpx
  - curl-to-javascript
---

## Requests and HTTPX output

Choose Requests for the familiar synchronous Python API, or HTTPX for a modern
client with a closely related interface. CurlToCode emits the required import and
keeps dependency installation separate from the generated source, so you can copy
the code without copying a shell command into it.

The two clients differ in small but real ways. Requests uses `allow_redirects`
where HTTPX uses `follow_redirects`, and a raw body goes to `data=` on Requests
but `content=` on HTTPX. The generated code uses whichever is correct for the
client you picked.

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
