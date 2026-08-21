---
slug: curl-to-dart
title: cURL to Dart – package:http & Dio | CurlToCode
description: Convert cURL to Dart package:http or Dio code for Flutter and server apps, with redirects, exact bodies, headers, multipart uploads, and local files.
heading: Convert cURL to Dart
eyebrow: Flutter and Dart HTTP clients
lede: Generate a low-level package:http request or a Dio call with redirect and status behaviour stated directly in the output.
language: dart
client: http
languageLabel: Dart
clientLabel: package:http
order: 33
faqs:
  - question: Should I choose package:http or Dio?
    answer: package:http is the small official ecosystem client and works well for straightforward requests. Dio adds interceptors, cancellation, progress callbacks, richer configuration, and a common architecture for larger Flutter applications.
  - question: Can both Dart targets upload files?
    answer: Yes. package:http uses MultipartFile.fromPath and reads raw file bytes when needed. Dio uses MultipartFile.fromFile for forms and streams a raw file body through dart:io.
  - question: Why do repeated headers return a limitation?
    answer: Both clients accept request headers as a Dart Map, which can hold only one value per key. Replacing or joining repeated names would not preserve every HTTP header's semantics.
related:
  - curl-to-dart/http
  - curl-to-dart/dio
  - curl-to-kotlin
  - curl-to-swift
---

## The official client and the application client

`package:http` exposes an explicit `Request` and `MultipartRequest`. Building
those objects rather than calling convenience functions makes custom methods,
redirect flags, and streaming responses available through one consistent path.

Dio centralizes policies in `Options` and fits applications that already use
interceptors, cancellation tokens, and upload progress. The generated request
disables status rejection so error responses remain visible like cURL output.

## Bytes, files, and forms

Both generators preserve already serialized body strings. `package:http` uses
`bodyBytes` for a raw file and `MultipartFile.fromPath` for form files. Dio opens
a raw file as a stream and uses `FormData` plus `MultipartFile.fromFile` for
multipart input.

File references remain source-code paths. CurlToCode neither reads them nor
performs any network request in the browser.

## Redirects and status responses

Both targets set `followRedirects` from the cURL `-L` option rather than relying
on their defaults. Dio additionally uses `validateStatus: (status) => true` so a
4xx or 5xx response is returned instead of thrown as an exception.
