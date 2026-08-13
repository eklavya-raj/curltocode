---
direction: code-to-curl
slug: python-to-curl/requests
parent: python-to-curl
title: Python Requests to cURL Converter | CurlToCode
description: Convert static Python Requests calls to cURL locally, including params, headers, cookies, JSON, data, files, basic auth, and redirect behavior.
heading: Convert Python Requests to cURL
eyebrow: Requests source parser
lede: Parse requests.get(), requests.post(), and requests.request() calls into readable cURL without importing Requests or executing the Python source.
language: python
client: requests
languageLabel: Python
clientLabel: Requests
order: 131
faqs:
  - question: Which Requests call forms are supported?
    answer: Common method helpers such as requests.get and requests.post are supported, along with requests.request when its method and request values can be resolved statically.
  - question: How are params and cookies converted?
    answer: Static params become URL query pairs and static cookies become cURL cookie data. Repeated values are retained when their Python representation can express them.
  - question: Can files tuples become cURL form fields?
    answer: Supported static files lists and tuples become multipart form flags with their field name, filename, local path, and media type preserved where present.
related:
  - python-to-curl/httpx
  - python-to-curl/aiohttp
  - python-to-curl
  - curl-to-python/requests
---

## Requests calls and arguments

The parser reads static module helpers including `requests.get`,
`requests.post`, and other standard methods. `requests.request` is useful for a
custom method because its first argument supplies the method explicitly.

The URL and `params` become a single normalized URL plus ordered query pairs.
`headers`, `cookies`, and `auth` remain separate request concepts until the cURL
generator chooses conventional flags for them.

## JSON, raw data, forms, and files

A static `json` value becomes a JSON body. A string passed through `data` can be
kept as exact raw or URL-encoded content according to its representation and
headers. Supported mapping and pair forms preserve form fields without executing
Requests' serializer.

Multipart `files` lists are especially useful because they can preserve repeated
field names. Static filename, file reference, and media type information maps to
readable `-F` arguments instead of being flattened into an opaque body.

## Sessions and runtime state

A Requests session may inherit cookies, headers, adapters, or authentication
from earlier statements. Only state represented statically in a supported form
can be recovered. Server-set cookies from previous calls are runtime state and
cannot be invented for a standalone cURL command.

If a URL, header mapping, or body comes from a function call, CurlToCode reports
the expression and keeps independently known request fields available.
