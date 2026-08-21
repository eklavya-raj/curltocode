---
slug: curl-to-php/laravel
parent: curl-to-php
title: cURL to Laravel HTTP Client Converter | CurlToCode
description: Convert cURL to Laravel Http facade chains with repeated headers, raw bodies, authentication, multipart attachments, local files, and redirect parity.
heading: Convert cURL to Laravel HTTP Client
eyebrow: Laravel Http facade
lede: Generate fluent Laravel request chains over Guzzle, including native attachment calls and no-redirect policy when cURL omitted -L.
language: php
client: laravel
languageLabel: PHP
clientLabel: Laravel HTTP client
order: 56
faqs:
  - question: Why does the generated call use send instead of get or post?
    answer: The generic send method accepts every standard and extension verb through one stable shape. It avoids different helper signatures and keeps custom methods intact.
  - question: How are redirects disabled?
    answer: Laravel's client wraps Guzzle, which follows redirects by default. withoutRedirecting is added for a command without -L; the normal client policy is retained when the command opted in.
  - question: Can repeated request headers survive?
    answer: Yes. Array header values are passed through to Guzzle as repeated fields, so the generator groups values by case-insensitive name without discarding their order.
related:
  - curl-to-php
  - curl-to-php/symfony
  - curl-to-php/guzzle
  - curl-to-php/curl
---

## Fluent Laravel requests

The output starts with the `Http` facade, adds headers and authentication, sets
the body or attachments, controls redirects, and finishes with generic `send`.
That final method supports the exact verb rather than limiting conversion to the
framework's named shortcuts.

Header arrays preserve repeated names through the underlying Guzzle client.
Basic credentials use `withBasicAuth` instead of a precomputed header.

## Raw bodies and attachments

Already serialized payloads go through `withBody` with their media type. A file
body is read by the generated PHP program. Multipart fields use `attach`; file
parts retain their name, submitted filename, and optional content type.

Laravel owns the multipart boundary, so a copied boundary header is omitted.
The web converter never reads the path or contacts the URL.

## Redirects and responses

Guzzle follows redirects by default. `withoutRedirecting()` is therefore part
of output for cURL without `-L`. Laravel returns a response wrapper for HTTP
error statuses, and the example prints `body()` without introducing retries.

The client ships with Laravel; standalone dependency metadata identifies the
underlying `guzzlehttp/guzzle` package.
