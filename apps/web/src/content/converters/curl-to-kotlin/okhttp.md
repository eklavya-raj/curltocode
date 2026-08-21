---
slug: curl-to-kotlin/okhttp
parent: curl-to-kotlin
title: cURL to Kotlin OkHttp Converter | CurlToCode
description: Convert cURL to idiomatic Kotlin OkHttp 5 code with exact method bodies, repeated headers, redirect controls, credentials, and multipart file uploads.
heading: Convert cURL to Kotlin OkHttp
eyebrow: Android and JVM HTTP
lede: Generate complete OkHttp 5 request builders with append-only headers, explicit redirect policy, and file-backed request bodies.
language: kotlin
client: okhttp
languageLabel: Kotlin
clientLabel: OkHttp
order: 311
faqs:
  - question: Why can a bodyless POST still get an empty request body?
    answer: OkHttp rejects null bodies for methods such as POST, PUT, and PATCH, while cURL can send those methods with zero content. An empty ByteArray request body preserves the valid zero-length exchange.
  - question: How does OkHttp preserve duplicate headers?
    answer: The generated builder uses addHeader, which appends another field value. It does not use header for ordinary fields because header replaces all values with the same case-insensitive name.
  - question: Which OkHttp dependency does the snippet use?
    answer: The generated dependency is com.squareup.okhttp3:okhttp:5.3.2. Request bodies use the Kotlin companion extensions supplied by that version.
related:
  - curl-to-kotlin
  - curl-to-kotlin/ktor
  - curl-to-java/okhttp
  - curl-to-nodejs
---

## An OkHttp 5 request builder

The output builds an `OkHttpClient` with redirect intent stated twice: regular
redirects and SSL redirects are controlled separately by OkHttp. The request
uses `.method(method, body)` so custom verbs and body-bearing verbs share one
correct path.

Methods for which OkHttp requires a non-null body receive a zero-length
`ByteArray` when the cURL request had no content. That is different from
inventing application data; it represents the empty request cURL sends.

## Headers, credentials, and content type

Ordinary fields use `.addHeader`, preserving repeated names. Basic credentials
use `Credentials.basic`, while bearer tokens and cookies remain explicit
headers. A body content type is passed to the `RequestBody` instead of added a
second time as an unrelated header.

## Files and multipart forms

Raw file bodies use `File.asRequestBody`. Multipart output uses
`MultipartBody.Builder`, with text fields added directly and files carrying the
submitted filename and optional media type. The file is read only when the
generated Kotlin runs.

The example performs a blocking `execute()` and closes the response via `use`.
In coroutine code, call it on an appropriate dispatcher or integrate an async
adapter rather than blocking the main thread.

Add `implementation("com.squareup.okhttp3:okhttp:5.3.2")` to the build.
