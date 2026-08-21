---
direction: code-to-curl
slug: postman-to-curl
title: Postman Collection to cURL Converter | CurlToCode
description: Convert Postman Collection v2.1 requests to cURL locally, reading nested folders, headers, auth, URLs, raw or form bodies, files, and redirect behavior.
heading: Convert Postman to cURL
eyebrow: Collection v2.1 request parsing
lede: Extract the first static request from a Postman collection and generate cURL without importing it into a workspace or running collection scripts.
language: postman
client: collection
languageLabel: Postman
clientLabel: collection v2.1
order: 213
faqs:
  - question: Can the parser find requests inside folders?
    answer: Yes. It walks nested collection items and the library API lists each request name for selection. The page converts the first request in collection order.
  - question: Are Postman scripts or variables executed?
    answer: No. Pre-request scripts, tests, dynamic variables, and environment resolution are never run. Literal static request values are parsed; unresolved values remain explicit limitations.
  - question: What happens to disabled headers?
    answer: Disabled collection headers are intentionally omitted because Postman would not send them. Enabled duplicates retain their order.
related:
  - curl-to-postman
  - har-to-curl
  - json-to-curl
  - httpie-to-curl
---

## Walking collection folders

Postman collections can nest folders and request items arbitrarily. The parser
walks that tree, identifies request objects, and exposes their names through the
entry-listing API. The simple converter selects the first request predictably.

Headers, authentication blocks, raw, URL-encoded, multipart, and file body
modes map into the normalized model. Disabled headers are skipped.

## No workspace or script execution

Conversion does not connect to Postman, import an environment, run a pre-request
script, evaluate tests, or resolve runtime variables. Those actions could leak
credentials or change the request and are outside static parsing.

Literal protocol profile redirect settings map to cURL `-L`. Dynamic variables
that prevent a URL or body from being known are reported rather than guessed.

The full collection stays in the browser during conversion.
