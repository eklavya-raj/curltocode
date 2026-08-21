---
slug: curl-to-kotlin/ktor
parent: curl-to-kotlin
title: cURL to Kotlin Ktor Converter | CurlToCode
description: Convert cURL to Ktor Client code with CIO, arbitrary methods, repeated headers, redirect policy, exact bodies, and multipart or file-backed uploads.
heading: Convert cURL to Kotlin Ktor
eyebrow: Coroutine-based Kotlin client
lede: Generate Ktor Client requests using the CIO engine, with redirect policy and request details expressed in Kotlin's typed builder API.
language: kotlin
client: ktor
languageLabel: Kotlin
clientLabel: Ktor
order: 312
faqs:
  - question: Is the generated Ktor code multiplatform?
    answer: The request API is Kotlin Multiplatform, but the concrete CIO engine and java.io.File operations in file examples target the JVM. Swap the engine and file source when moving the snippet to iOS or JavaScript.
  - question: Can Ktor send a custom HTTP method?
    answer: Yes. The generated request constructs HttpMethod from the exact cURL token instead of limiting output to named convenience functions such as get or post.
  - question: Are duplicate headers kept?
    answer: Yes. Ktor's header function appends to a HeadersBuilder, so repeated names remain separate values and preserve their original order.
related:
  - curl-to-kotlin
  - curl-to-kotlin/okhttp
  - curl-to-swift/urlsession
  - curl-to-dart/http
---

## Ktor Client with CIO

The generated source creates `HttpClient(CIO)` and configures its redirect
policy before issuing a typed `client.request`. `HttpMethod` is constructed from
the exact method text, so extension methods are not restricted to Ktor's named
verb helpers.

The response is read with `bodyAsText`. In a larger application, reuse a client
instead of constructing one per request and close it with the application's
lifecycle.

## Request builders preserve repeats

Each incoming field becomes a `header(name, value)` call. Ktor appends those
values, making it possible to preserve repeated header names that a `Map`-based
client would overwrite. Cookies and materialized authorization follow the same
path.

Raw serialized content is passed to `setBody`, not deserialized and encoded
again. This retains whitespace, ordering, and escape choices in the cURL body.

## Upload considerations

A raw file body uses a read channel. Multipart output uses
`MultiPartFormDataContent`; text parts append strings and file parts carry
content-disposition and media-type headers. The generated stable API reads a
multipart file into memory, so use a streaming part provider for very large
files.

Add `implementation("io.ktor:ktor-client-cio:3.4.0")` to the build.
