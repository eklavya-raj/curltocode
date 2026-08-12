---
slug: curl-to-php/guzzle
parent: curl-to-php
title: cURL to PHP Guzzle Converter | CurlToCode
description: Convert cURL commands to modern PHP Guzzle code with raw bodies, repeated headers, basic auth, redirects, multipart fields, and file streams.
heading: Convert cURL to PHP Guzzle
eyebrow: Guzzle HTTP client
lede: Generate Guzzle request options that keep raw body bytes intact and use the library's structured authentication, redirect, header, and multipart APIs.
language: php
client: guzzle
languageLabel: PHP
clientLabel: Guzzle
order: 51
faqs:
  - question: Why choose Guzzle over PHP's cURL extension?
    answer: Guzzle offers a PSR-7-oriented API, middleware, reusable clients, and test handlers that fit larger PHP applications. The cURL extension remains a smaller choice for one-off scripts with no Composer dependency.
  - question: Can Guzzle preserve duplicate header names?
    answer: Yes. A Guzzle header entry can contain an array of values, so repeated names are grouped under their first spelling while every value is retained in order.
  - question: Does the generated code re-encode JSON?
    answer: No. It uses the body request option with the original JSON string. The json option is intentionally avoided because it would serialize the value again and could change meaningful bytes.
related:
  - curl-to-php
  - curl-to-python/requests
  - curl-to-ruby/faraday
---

## Guzzle request options

The generated script creates a reusable `GuzzleHttp\Client` and calls its
generic `request` method. Method and URL are separate arguments; headers,
authentication, redirects, and body data live in the options array.

`allow_redirects` is emitted as a boolean even though Guzzle has its own default.
That keeps the behavior tied to cURL's `-L` rather than an implicit client
setting.

## Raw bodies and multipart streams

JSON, text, and URL-encoded content use the `body` option, which sends the given
string without serializing it. Binary file bodies are opened in `rb` mode and
streamed by Guzzle.

Multipart bodies use the documented list-of-parts representation. Each entry
has a name and contents; file entries also retain the posted filename and an
optional per-part `Content-Type`. The list can carry repeated field names,
unlike an associative form map.

## Common Guzzle issues

**`json` and `body` are not interchangeable.** Use `json` when you want Guzzle
to serialize a PHP value. The converter uses `body` because cURL already supplied
serialized bytes.

**Multipart controls its own top-level content type.** Supplying a copied
boundary makes the header disagree with Guzzle's generated stream, so the
converter reports that case.

**The client throws for HTTP errors by default.** Catch
`GuzzleHttp\Exception\RequestException` or set `http_errors` deliberately if
your application wants to inspect 4xx and 5xx responses as ordinary results.
