---
slug: curl-to-python/requests
parent: curl-to-python
title: cURL to Python Requests Converter | CurlToCode
description: Convert cURL commands to Python Requests code in your browser, with correct handling of JSON bodies, forms, multipart uploads, cookies, and basic auth.
heading: Convert cURL to Python Requests
eyebrow: requests library
lede: Generate code for the requests library specifically, using its own argument names for redirects, raw bodies, and authentication.
language: python
client: requests
languageLabel: Python
clientLabel: Requests
order: 11
faqs:
  - question: What is the difference between the data and json arguments?
    answer: The json argument serializes a Python object and sets Content-Type for you, which can reorder keys and change whitespace. The data argument sends bytes verbatim. The converter uses data so the request body matches cURL byte for byte, which matters whenever a body is signed or hashed.
  - question: How do I reuse a connection across several requests?
    answer: Replace the module-level call with a requests.Session object and call the same method on it. The session keeps a connection pool and persists cookies, which is significantly faster for repeated calls to the same host.
  - question: Why is allow_redirects set explicitly?
    answer: requests follows redirects by default for every method except HEAD, while cURL follows none unless you pass -L. Writing the value out makes the generated code behave like your original command rather than inheriting a different default.
related:
  - curl-to-python/httpx
  - curl-to-python
  - curl-to-javascript
---

## Requests-specific output

The generated code calls the convenience function that matches your method —
`requests.get`, `requests.post`, and so on — falling back to `requests.request`
with an explicit method string for anything outside that set.

Headers are passed as a dictionary, cookies as a separate `cookies` mapping, and
basic credentials as an `auth` tuple. Passing credentials as a tuple lets
requests handle the base64 encoding, which is both shorter and harder to get
wrong than building the header yourself.

## Uploads and forms

Multipart requests use the `files` argument as a list of tuples rather than a
dictionary, because a dictionary could not hold two parts with the same name.
Text-only `-F` requests still produce multipart output, using a `None` filename in
the tuple to force multipart encoding rather than falling back to a URL-encoded
form.

## Common conversion issues

**`data=` with a dictionary is not the same as `data=` with a string.** Given a
dictionary, requests URL-encodes it and sets a form content type. The generated
code passes a string precisely to avoid that transformation.

**Session objects change cookie behaviour.** A bare `requests.post` sends only
the cookies you pass. A `Session` also sends anything the server previously set,
which can make a request succeed locally and fail in isolation.

**`verify=False` is not generated for you.** If your original command used `-k`
or `--insecure`, that is a TLS decision the converter will not make on your
behalf; add it deliberately if you need it.
