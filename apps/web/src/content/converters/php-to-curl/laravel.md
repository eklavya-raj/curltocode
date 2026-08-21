---
direction: code-to-curl
slug: php-to-curl/laravel
parent: php-to-curl
title: Laravel HTTP Client to cURL Converter | CurlToCode
description: Convert Laravel HTTP client chains to a cURL command, reading withHeaders, withBody, withBasicAuth, attach, asForm, and withoutRedirecting statically.
heading: Convert Laravel HTTP to a cURL command
eyebrow: Laravel parser
lede: Follow a chain on the Http facade and recover the request it builds, without booting the framework.
language: php
client: laravel
languageLabel: PHP
clientLabel: Laravel HTTP
order: 144
faqs:
  - question: Which chain steps are understood?
    answer: withHeaders, withHeader, withBody, withToken, withBasicAuth, withQueryParameters, attach, asForm, asJson, withoutRedirecting, send, and the per-verb methods.
  - question: How does an attachment convert?
    answer: attach with a name and a static value becomes a multipart field. An attachment whose contents are read at run time is reported, because there is no path left to convert.
  - question: Why does a Laravel request follow redirects by default?
    answer: The client wraps Guzzle, which follows unless told not to. Only withoutRedirecting turns that off, and the converted command reflects whichever the chain says.
related:
  - php-to-curl
  - php-to-curl/guzzle
  - curl-to-php/laravel
  - php-to-curl/symfony
---

## A facade and a chain

Laravel's client starts at the `Http` facade and returns itself from every
step, so the request is one expression ending in a verb method or in `send`.
The reader matches the steps by name, which is safe here because it only runs
once the file has identified itself as Laravel.

## Bodies

`withBody` names the payload and its media type together, which is the closest
Laravel gets to sending exact bytes. `asForm` and `asJson` instead ask the
client to serialize the data passed to the verb method, and each brings the
content type it implies.

## Redirects

Laravel is Guzzle underneath, so a request follows a 3xx unless the chain calls
`withoutRedirecting`. That is the opposite of cURL's default, which is why the
step matters to the converted command rather than being cosmetic.
