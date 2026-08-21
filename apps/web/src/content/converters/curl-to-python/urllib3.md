---
slug: curl-to-python/urllib3
parent: curl-to-python
title: cURL to Python urllib3 Converter | CurlToCode
description: Convert cURL to Python urllib3 code with HTTPHeaderDict repeats, explicit redirect policy, exact request bodies, auth, cookies, multipart fields, and files.
heading: Convert cURL to Python urllib3
eyebrow: Pooled low-level Python HTTP
lede: Generate urllib3 PoolManager requests that preserve repeated headers and multipart field order while keeping redirect intent visible.
language: python
client: urllib3
languageLabel: Python
clientLabel: urllib3
order: 16
faqs:
  - question: Why choose urllib3 over Requests?
    answer: urllib3 exposes connection pooling and low-level request controls directly, and HTTPHeaderDict can preserve repeated names. Requests is more ergonomic for ordinary application code but intentionally presents a simpler mapping interface.
  - question: How are duplicate headers emitted?
    answer: The generator creates urllib3.HTTPHeaderDict and calls add for every ordered field. When no name repeats, it emits a normal dict for more readable code.
  - question: Can multipart fields have repeated names?
    answer: Yes. Fields are a list of pairs rather than a dict, so the same form name can occur more than once and retain its order.
related:
  - curl-to-python
  - curl-to-python/httpclient
  - curl-to-python/requests
  - curl-to-python/httpx
---

## Low-level pooling with header fidelity

The output creates a `urllib3.PoolManager` and calls its generic `request`
method. This supports every valid method and exposes redirect policy with a
boolean argument.

Repeated request headers use `HTTPHeaderDict.add`, one of the few Python client
interfaces that does not force all values into a regular dictionary. Requests
and HTTPX report those cases because choosing the final value would be lossy.

## Request bodies and forms

Raw serialized data uses the `body` argument. A file body is passed as an open
binary object. Multipart parts become a list of field pairs; text fields use a
`None` filename and file fields carry the submitted filename and optional
content type.

That list shape also keeps repeated form field names, which a dict cannot hold.
The generated example reads file content for multipart values, so adapt the code
to a streaming encoder for very large forms.

## Redirects

`redirect=True` is emitted only for a command with `-L`; otherwise the value is
false. The policy is explicit instead of inheriting whatever a future library
version chooses as a default.

Install the dependency with `pip install urllib3`.
