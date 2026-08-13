---
direction: code-to-curl
slug: python-to-curl/httpx
parent: python-to-curl
title: Python HTTPX to cURL Converter | CurlToCode
description: Convert static Python HTTPX requests to cURL locally, preserving params, headers, cookies, JSON, content, files, authentication, and redirects.
heading: Convert Python HTTPX to cURL
eyebrow: HTTPX source parser
lede: Turn HTTPX request helpers and statically knowable client calls into conventional cURL without running Python or contacting the destination.
language: python
client: httpx
languageLabel: Python
clientLabel: HTTPX
order: 132
faqs:
  - question: Does the parser support HTTPX method helpers?
    answer: Yes. Static calls such as httpx.get and httpx.post are recognized, as are supported request forms where the method and URL are explicitly represented.
  - question: How is follow_redirects mapped to cURL?
    answer: A true value becomes cURL's -L option. A false value needs no flag because cURL does not follow redirects by default, matching HTTPX's own default.
  - question: What is the difference between content and json?
    answer: HTTPX content represents already prepared body bytes or text, while json serializes a structured value. The normalized body keeps that semantic distinction for cURL generation.
related:
  - python-to-curl/requests
  - python-to-curl/aiohttp
  - python-to-curl
  - curl-to-python/httpx
---

## HTTPX request forms

HTTPX module helpers expose the HTTP method through names such as `httpx.get`
and `httpx.post`. Static client request calls can also provide method and URL
arguments explicitly. Query params, headers, cookies, and authentication are
recovered as distinct normalized fields.

That model matters because combining everything into headers too early would
lose the difference between basic authentication, cookie data, and an explicit
Authorization header.

## Body and redirect semantics

HTTPX uses `content` for raw prepared content, `data` for form-oriented data,
`json` for structured JSON, and `files` for multipart requests. Supported static
values are converted to their matching cURL body flags without executing HTTPX's
encoders.

`follow_redirects=True` maps to `-L`. HTTPX and cURL both default to not
following redirects, so an omitted or false setting does not need a misleading
extra flag.

## Clients, async code, and dynamic state

Whether a call is awaited does not change its request semantics. However, a
Client or AsyncClient may carry inherited base URLs, headers, cookies, or hooks.
Those values must be present in a statically supported form to be included.

Runtime expressions are reported with their source rather than evaluated. This
keeps tokens, environment configuration, and application behavior local and
prevents a partial cURL command being presented as complete.
