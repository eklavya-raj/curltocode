---
slug: curl-to-dart/http
parent: curl-to-dart
title: cURL to Dart package:http Converter | CurlToCode
description: Convert cURL to Dart package:http Request or MultipartRequest code with custom methods, redirect parity, exact bodies, headers, files, and streamed responses.
heading: Convert cURL to Dart package:http
eyebrow: Official Dart HTTP package
lede: Generate explicit package:http request objects for Flutter, command-line, and server applications without limiting the method to convenience helpers.
language: dart
client: http
languageLabel: Dart
clientLabel: package:http
order: 331
faqs:
  - question: Why not generate http.get or http.post?
    answer: The convenience functions do not expose every policy and verb consistently. An explicit Request supports custom methods, a redirect flag, exact bytes, and the same send path for every cURL command.
  - question: How is multipart Content-Type handled?
    answer: MultipartRequest creates its own boundary and matching header. The generator omits a copied multipart Content-Type value so it cannot conflict with the actual encoded body.
  - question: What dependency is required?
    answer: Run dart pub add http. Multipart media types also use the transitive http_parser API imported by the generated source when a file declares a content type.
related:
  - curl-to-dart
  - curl-to-dart/dio
  - curl-to-kotlin/ktor
  - curl-to-swift/urlsession
---

## One explicit request path

The output parses the URL into a `Uri` and creates either `http.Request` or
`http.MultipartRequest` with the exact method. This supports extension verbs and
sets `followRedirects` directly from `-L`.

Headers are added as a map, which is concise but cannot preserve duplicate
names. Such requests return a limitation instead of dropping an earlier value.

## Body and upload handling

Textual serialized data is assigned to `request.body`. A raw file becomes
`bodyBytes` from `File.readAsBytes`. Multipart fields use `request.fields`, and
files use `MultipartFile.fromPath` with the filename and optional parsed media
type.

The generated example sends through `http.Client` and consumes the streamed
response as text. Reuse and close a client in production code instead of
creating a new instance for every request.

Run `dart pub add http` to install the package.
