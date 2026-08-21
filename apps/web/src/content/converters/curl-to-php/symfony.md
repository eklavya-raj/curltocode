---
slug: curl-to-php/symfony
parent: curl-to-php
title: cURL to Symfony HttpClient Converter | CurlToCode
description: Convert cURL to Symfony HttpClient PHP code with repeated headers, exact bodies, streamed files, multipart MIME parts, authentication, and redirects.
heading: Convert cURL to Symfony HttpClient
eyebrow: Symfony component HTTP
lede: Generate Symfony HttpClient requests that keep repeated headers, expose HTTP error bodies, and use Mime for multipart encoding.
language: php
client: symfony
languageLabel: PHP
clientLabel: Symfony HttpClient
order: 55
faqs:
  - question: Why does multipart output require symfony/mime?
    answer: HttpClient sends iterable bodies but does not itself build multipart part headers and boundaries. FormDataPart and DataPart from the Mime component construct the encoded form correctly.
  - question: Can Symfony HttpClient preserve duplicate headers?
    answer: Yes. An array value under a header name is sent once per element, so the generator groups repeated names without flattening them into one string.
  - question: Why call getContent with false?
    answer: The default call throws for 4xx and 5xx statuses. Passing false returns the response content, matching cURL's usual ability to print an HTTP error body.
related:
  - curl-to-php
  - curl-to-php/laravel
  - curl-to-php/guzzle
  - curl-to-php/curl
---

## Symfony's standalone client

The generated source creates an `HttpClient`, then calls the generic `request`
method with the exact verb and URL. Options carry grouped headers, a body,
structured basic authentication, and an explicit redirect budget.

Repeated header names become array values. Symfony sends each element as a
field, which avoids the data loss of a simple associative array.

## Bodies and multipart forms

Serialized data is passed directly. A raw file is opened as a stream rather
than copied into memory. Multipart output uses `FormDataPart` and `DataPart` to
derive a correct boundary and part headers, then feeds the resulting iterable
body to HttpClient.

The original multipart `Content-Type` is replaced with the prepared header so
its boundary always matches the encoded content.

## Responses and redirects

`max_redirects` is zero without `-L` and uses Symfony's finite normal budget
with it. Calling `getContent(false)` prevents an HTTP status exception from
hiding the response body.

Install with `composer require symfony/http-client symfony/mime`.
