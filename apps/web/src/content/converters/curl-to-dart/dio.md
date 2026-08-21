---
slug: curl-to-dart/dio
parent: curl-to-dart
title: cURL to Dart Dio Converter | CurlToCode
description: Convert cURL to Dart Dio request code with FormData uploads, streamed file bodies, exact payloads, headers, redirect controls, and visible error statuses.
heading: Convert cURL to Dart Dio
eyebrow: Full-featured Flutter HTTP
lede: Generate Dio calls for Flutter and Dart applications with request policy, file handling, and HTTP-status behaviour made explicit.
language: dart
client: dio
languageLabel: Dart
clientLabel: Dio
order: 332
faqs:
  - question: Why does the output set validateStatus to always true?
    answer: Dio treats many non-2xx statuses as errors by default, while cURL normally returns the server's response. Accepting every status keeps a 404 or 500 available in response.data for the caller to inspect.
  - question: Does Dio stream a raw file body?
    answer: Yes. The generated Dart opens the file as a stream instead of loading the entire payload into memory. Multipart files use MultipartFile.fromFile through Dio's FormData API.
  - question: Can Dio preserve duplicate request header names?
    answer: No through its ordinary Options headers map. The converter reports a repeated name because keeping only one or joining the values could change the request.
related:
  - curl-to-dart
  - curl-to-dart/http
  - curl-to-swift/alamofire
  - curl-to-kotlin/ktor
---

## Dio request options

The generated call uses `dio.request`, which accepts every method through one
API. `Options` carries the method, headers, redirect flag, and a validation
predicate that returns HTTP error statuses instead of throwing them.

That predicate aligns response handling with ordinary cURL behaviour. Network
failures can still throw, as they should; a completed 404 exchange remains a
normal response object.

## FormData and streaming files

Multipart input becomes `FormData.fromMap`. File parts use
`MultipartFile.fromFile` with the posted filename and optional `DioMediaType`.
A standalone file body is opened as a stream through `dart:io`, avoiding a full
buffer for large payloads.

Serialized JSON and form strings are supplied without parsing. If an application
wants Dio to encode a Dart object, that is a deliberate semantic change from the
bytes in the pasted command.

Run `dart pub add dio` to install the package.
