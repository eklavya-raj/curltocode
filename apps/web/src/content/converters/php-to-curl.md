---
direction: code-to-curl
slug: php-to-curl
title: PHP to cURL – cURL Extension & Guzzle | CurlToCode
description: Convert static PHP requests to cURL locally, reading curl_setopt options and Guzzle client calls including headers, JSON, form fields, auth, and redirects.
heading: Convert PHP to cURL
eyebrow: PHP HTTP parser
lede: Turn PHP that configures the cURL extension or calls a Guzzle client into a conventional cURL command, without running the script or sending its request.
language: php
client: curl
languageLabel: PHP
clientLabel: cURL extension
order: 140
faqs:
  - question: Which PHP HTTP clients can be converted?
    answer: The parser reads PHP's own cURL extension, through both curl_setopt_array and repeated curl_setopt calls, and Guzzle's request, get, post, put, patch, and delete methods.
  - question: Does CurlToCode run the PHP script to work out the request?
    answer: No. Conversion is entirely static. Includes, function calls, superglobals, and the represented HTTP request are never executed, so nothing reaches a server.
  - question: Why does an array of post fields become a multipart request?
    answer: PHP's cURL extension changes representation based on the argument type. A string CURLOPT_POSTFIELDS is sent verbatim, while an array is sent as multipart/form-data, and the conversion reflects that.
related:
  - php-to-curl/curl
  - php-to-curl/guzzle
  - curl-to-php
  - go-to-curl
---

## The cURL extension and Guzzle

Select PHP in the first menu, then choose the library the snippet uses. Both are
read the same way: literals, array literals, static string concatenation, and
variables assigned exactly once to a known value.

A variable assigned more than once is deliberately left unresolved. Choosing one
of its values would require following the script's control flow, and guessing
wrong would produce a command that does not match the code.

## Options that map onto the request

For the cURL extension, `CURLOPT_URL`, `CURLOPT_CUSTOMREQUEST`,
`CURLOPT_HTTPHEADER`, `CURLOPT_POSTFIELDS`, `CURLOPT_USERPWD`,
`CURLOPT_FOLLOWLOCATION`, `CURLOPT_COOKIE`, `CURLOPT_USERAGENT`, and
`CURLOPT_REFERER` all carry directly into the generated command.

Guzzle's options map just as directly: `headers`, `json`, `form_params`,
`multipart`, `body`, `query`, `auth`, and `allow_redirects`. The two clients
differ on redirects, and the conversion preserves that difference rather than
flattening it.

## What cannot be resolved safely

A value produced by a function call, read from the environment, or built from a
variable the script reassigns cannot be known without running the program. Each
one is reported with the expression that caused it, so the gap is visible rather
than filled in with an invented value.
