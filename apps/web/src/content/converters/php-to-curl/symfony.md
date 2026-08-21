---
direction: code-to-curl
slug: php-to-curl/symfony
parent: php-to-curl
title: Symfony HttpClient to cURL Converter | CurlToCode
description: Convert Symfony HttpClient calls to a cURL command, reading headers, body, auth_basic, max_redirects, and a FormDataPart multipart form statically.
heading: Convert Symfony HttpClient to a cURL command
eyebrow: Symfony parser
lede: Read a Symfony HttpClient request, including the multipart form that symfony/mime builds beside it.
language: php
client: symfony
languageLabel: PHP
clientLabel: Symfony HttpClient
order: 143
faqs:
  - question: Which options are read?
    answer: headers, body, json, query, auth_basic, and max_redirects. The reader takes the same options array Symfony documents rather than a subset of it.
  - question: How is a multipart form recovered?
    answer: From the FormDataPart the code builds before the call. Its array of fields becomes the multipart body, and the prepared boundary header is left out as framing.
  - question: What does max_redirects zero mean?
    answer: That the request stops at the first response, which becomes a command without -L. Any positive budget becomes one with it.
related:
  - php-to-curl
  - php-to-curl/guzzle
  - curl-to-php/symfony
  - php-to-curl/laravel
---

## The same shape as Guzzle

`$client->request($method, $url, $options)` is the call, and it looks exactly
like Guzzle's. The two are told apart by the import, because their option names
differ: Symfony counts redirects where Guzzle switches them, and names its
credentials `auth_basic` where Guzzle uses `auth`.

## Multipart lives outside the call

Symfony's HttpClient has no multipart encoder. Code builds a `FormDataPart`
from symfony/mime, then passes its iterable body and merges its prepared
headers into the options array.

Both of those are calls the reader cannot evaluate, so the form is recovered
from the `FormDataPart` construction itself, and the prepared header half of
the `array_merge` is left out. That half is the multipart content type and its
boundary — framing for one message rather than part of the request.

## Redirect budget

`max_redirects` is a count, not a flag. Zero means the request stops where it
started, and the converted command says so by leaving `-L` off.
