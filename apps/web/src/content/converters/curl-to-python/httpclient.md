---
slug: curl-to-python/httpclient
parent: curl-to-python
title: cURL to Python http.client Converter | CurlToCode
description: Convert cURL to dependency-free Python http.client code with exact URL paths, headers, authentication, request bytes, multipart encoding, and file bodies.
heading: Convert cURL to Python http.client
eyebrow: Python standard library HTTP
lede: Generate a zero-dependency HTTPConnection or HTTPSConnection request while making redirect and mapping limitations explicit.
language: python
client: httpclient
languageLabel: Python
clientLabel: http.client
order: 15
faqs:
  - question: Why does http.client split the URL into a host and path?
    answer: HTTPConnection is constructed for one origin, while its request method takes the origin-form path and query. The generator parses the URL and selects HTTPConnection or HTTPSConnection from its scheme.
  - question: Can http.client follow redirects automatically?
    answer: No. It exposes the 3xx response and leaves a new request to the caller. A command containing -L is rejected because silently dropping that behaviour would be incorrect.
  - question: Does this output require pip install?
    answer: No. http.client is part of Python's standard library. Multipart output is assembled with bytes and file reads rather than relying on a third-party encoder.
related:
  - curl-to-python
  - curl-to-python/urllib3
  - curl-to-python/requests
  - curl-to-http
---

## The standard-library layer

`http.client` is the low-level HTTP implementation underneath much of Python's
client ecosystem. The output creates an `HTTPConnection` or `HTTPSConnection`
for the URL's host and optional port, then sends the path and query through
`connection.request`.

Because headers are a mapping in that convenience method, repeated names cannot
be preserved. [urllib3](/curl-to-python/urllib3) is the dependency-backed Python
target when `HTTPHeaderDict` is needed for repeated values.

## Redirects are a controlled limitation

The module does not implement redirect following. A correct implementation of
`-L` would need to read each response, resolve `Location`, choose the subsequent
method, and enforce a loop limit. The generator reports the option rather than
emitting code that stops at the first response.

## Bodies and connection cleanup

Serialized strings are encoded as UTF-8, a raw file can be passed as an open
binary object, and multipart output assembles bytes with a matching boundary.
The response is read and decoded before `connection.close()`.

The multipart example buffers its complete body. For large forms, choose
Requests, HTTPX, aiohttp, or a custom streaming encoder.
