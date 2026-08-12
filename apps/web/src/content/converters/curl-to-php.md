---
slug: curl-to-php
title: cURL to PHP Converter – ext-curl & Guzzle | CurlToCode
description: Convert cURL to PHP using ext-curl or Guzzle. Preserve raw JSON, forms, file uploads, repeated headers, cookies, authentication, and redirects.
heading: Convert cURL to PHP
eyebrow: PHP HTTP clients
lede: Generate low-level ext-curl or application-friendly Guzzle code while preserving the request represented by your original command.
language: php
client: curl
languageLabel: PHP
clientLabel: cURL extension
order: 50
faqs:
  - question: Why does PHP output look so similar to the original command?
    answer: PHP's cURL extension is a thin binding over libcurl, the same library the cURL command-line tool uses. Most command-line flags have a direct CURLOPT_ equivalent, so the conversion is closer to a translation than a rewrite.
  - question: Does the generated PHP preserve duplicate header names?
    answer: Yes. CURLOPT_HTTPHEADER takes a list of raw header lines rather than an associative array, so repeating a name simply adds another line. Nothing is merged or overwritten.
  - question: Should I use ext-curl or Guzzle?
    answer: ext-curl is the direct dependency-free binding to libcurl and suits small scripts. Guzzle needs Composer but provides reusable clients, middleware, PSR-7 integration, and testing tools that fit larger applications.
related:
  - curl-to-php/guzzle
  - curl-to-python
  - curl-to-ruby
  - curl-to-go
---

## How the PHP output is structured

The generated script initialises a handle with `curl_init`, applies every option
in a single `curl_setopt_array` call, executes the request, and then closes the
handle. `CURLOPT_RETURNTRANSFER` is always enabled so `curl_exec` returns the
response body as a string instead of writing it straight to output.

The method is set with `CURLOPT_CUSTOMREQUEST` rather than `CURLOPT_POST`,
because it expresses any verb uniformly, including `PATCH` and `DELETE`.

Guzzle output uses `Client::request` and a structured options array instead.
Repeated headers become arrays of values, while raw bodies stay on the `body`
option to avoid automatic serialization.

## Bodies and uploads

A JSON, text, or form body is passed to `CURLOPT_POSTFIELDS` as a string, which
tells libcurl to send exactly those bytes. This matters for JSON: passing an
array instead would make libcurl re-encode the data as a form, silently changing
the `Content-Type` and the wire format.

For `-F` uploads the converter passes an array instead, because that is what
triggers multipart encoding. File parts become `CURLFile` objects carrying the
path, the media type, and the posted filename, so libcurl generates the boundary
itself.

## Common conversion issues

**A string body and an array body mean different things.** If you hand
`CURLOPT_POSTFIELDS` an array, libcurl switches to `multipart/form-data` and
ignores any `Content-Type` you set. The converter only uses an array form when
the original command used `-F`.

**Redirects are off unless you asked for them.** `CURLOPT_FOLLOWLOCATION` is
emitted explicitly as `true` or `false` so the behaviour is visible rather than
inherited from a default that varies by configuration.

**`curl_error` returns a string, not a boolean.** The generated code compares it
against an empty string. Checking it with a plain truthiness test is a common
source of bugs when an error message happens to be falsy-looking.
