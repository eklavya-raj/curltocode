---
direction: code-to-curl
slug: python-to-curl/aiohttp
parent: python-to-curl
title: Python aiohttp to cURL Converter | CurlToCode
description: Convert static Python aiohttp session requests to cURL locally, including query params, headers, JSON, FormData uploads, BasicAuth, and redirects.
heading: Convert Python aiohttp to cURL
eyebrow: aiohttp source parser
lede: Parse supported aiohttp ClientSession requests and FormData construction into readable cURL without starting an event loop or executing source code.
language: python
client: aiohttp
languageLabel: Python
clientLabel: aiohttp
order: 133
faqs:
  - question: Does the converter run the async function?
    answer: No. Await and async-with syntax are parsed statically. No event loop starts, no session is created, and no represented network request is sent.
  - question: Can aiohttp FormData uploads be converted?
    answer: Supported static FormData creation and add_field calls are rebuilt as multipart request parts, including known filenames and content types.
  - question: How is aiohttp BasicAuth handled?
    answer: Static aiohttp BasicAuth credentials become normalized basic authentication and are emitted with cURL's conventional user option.
related:
  - python-to-curl/requests
  - python-to-curl/httpx
  - python-to-curl
  - curl-to-python/aiohttp
---

## ClientSession request parsing

aiohttp requests normally appear inside `async with` blocks and use a
`ClientSession`. CurlToCode recognizes supported static session method calls and
extracts their URL, method, params, headers, body, authentication, and redirect
behavior without running the coroutine.

The request may be awaited or used as an async context manager; those response
lifecycle details do not change the outgoing HTTP request represented by cURL.

## FormData and authentication

aiohttp assembles multipart bodies by creating `FormData` and adding fields over
several statements. When that construction is statically safe, text fields and
file parts are rebuilt in order. Known filenames and content types are kept in
the generated `-F` arguments.

Static `aiohttp.BasicAuth` values map to basic authentication. JSON and raw data
arguments retain their body distinction, while query params are incorporated
into the generated URL.

## Session defaults and dynamic expressions

A ClientSession can carry default headers, cookies, authentication, or a base
URL. Defaults that are not represented in the pasted static source cannot be
assumed. The converter reports unresolved expressions instead of pretending the
session has no additional request state.

This is also why callbacks, comprehensions using runtime inputs, and environment
lookups remain explicit limitations. Static request details are preserved, but
the Python program is never executed to fill the gaps.
