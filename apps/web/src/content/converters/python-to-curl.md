---
direction: code-to-curl
slug: python-to-curl
title: Python to cURL – Requests, HTTPX & aiohttp | CurlToCode
description: Convert static Python Requests, HTTPX, or aiohttp calls to cURL locally, with methods, params, headers, JSON, forms, files, auth, and redirects.
heading: Convert Python to cURL
eyebrow: Python HTTP parser
lede: Turn static Requests, HTTPX, or aiohttp source into a conventional cURL command without running the Python program or sending its represented request.
language: python
client: requests
languageLabel: Python
clientLabel: Requests
order: 130
faqs:
  - question: Which Python HTTP clients can be converted?
    answer: The current parser supports Requests, HTTPX, and aiohttp request forms. Choose the library explicitly after selecting Python, or use homepage auto-detection for an unknown snippet.
  - question: Does CurlToCode execute imported Python modules?
    answer: No. It performs static parsing only. Imports, helper functions, environment access, and the represented HTTP request are never executed.
  - question: Can dynamic f-strings be converted safely?
    answer: Static f-strings without placeholders are readable, but a placeholder depends on runtime state. The converter reports that expression instead of fabricating its value.
related:
  - python-to-curl/requests
  - python-to-curl/httpx
  - python-to-curl/aiohttp
  - curl-to-python
---

## Requests, HTTPX, and aiohttp source

Select Python in the first menu, then choose the library used by the snippet.
The parser understands module-level helpers and supported client or session call
forms. It recovers static URLs, methods, parameters, headers, cookies, bodies,
authentication, uploads, and redirect settings into the shared request model.

Library defaults are normalized before cURL is generated. Requests and aiohttp
commonly follow redirects by default, while HTTPX does not; cURL only follows
when `-L` is given. Accounting for those differences avoids an apparently small
conversion changing real behavior.

## Python body arguments

The `json` argument becomes structured JSON. Requests `data` and HTTPX `content`
can represent raw or form bodies depending on their static value and effective
content type. Supported `files` tuples and aiohttp `FormData` construction become
multipart cURL form flags, including filenames and media types.

Basic auth tuples and `aiohttp.BasicAuth` become cURL user credentials. Literal
Bearer or API-key headers stay explicit headers.

## Static values and limitations

Constants can be resolved when their value and scope are safe. Reassigned names,
function calls, comprehensions with runtime inputs, and environment values remain
dynamic. CurlToCode identifies the unresolved expression and never imports or
runs the code to discover it.

That static boundary keeps conversion private and predictable while still
preserving every request detail that can be proven from the pasted source.
