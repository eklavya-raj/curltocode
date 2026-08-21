---
slug: curl-to-kotlin
title: cURL to Kotlin – OkHttp & Ktor Converter | CurlToCode
description: Convert cURL to Kotlin OkHttp or Ktor code locally, preserving redirects, repeated headers, authentication, exact bodies, multipart fields, and files.
heading: Convert cURL to Kotlin
eyebrow: Android, JVM, and multiplatform HTTP
lede: Generate Kotlin requests for Android and JVM applications with OkHttp, or use Ktor's multiplatform client and CIO engine.
language: kotlin
client: okhttp
languageLabel: Kotlin
clientLabel: OkHttp
order: 31
faqs:
  - question: Should I choose OkHttp or Ktor for Kotlin?
    answer: OkHttp is the conventional choice on Android and the JVM, with a mature synchronous call API. Ktor fits coroutine-based and Kotlin Multiplatform projects, although the generated CIO engine dependency targets JVM execution.
  - question: Do the Kotlin targets preserve repeated headers?
    answer: Yes. OkHttp addHeader and Ktor header append values rather than replacing the earlier field, so duplicate names can remain ordered instead of being collapsed into a map.
  - question: How are cURL file references converted?
    answer: OkHttp creates request bodies from java.io.File. Ktor streams a raw file body through a channel and reads multipart files for form parts. The converter only writes the path; it never opens user files itself.
related:
  - curl-to-kotlin/okhttp
  - curl-to-kotlin/ktor
  - curl-to-java/okhttp
  - curl-to-swift
---

## OkHttp and Ktor solve different problems

OkHttp is a focused HTTP client used directly and underneath many Android
libraries. Its builder APIs handle methods, repeated headers, credentials, raw
bodies, and multipart forms predictably. The generated snippet performs a
synchronous call and closes the response with `use`.

Ktor is Kotlin-first and coroutine-friendly. Its client API can target several
platforms through interchangeable engines. CurlToCode emits the CIO engine for a
concrete runnable JVM snippet while keeping the request builder portable in
shape.

## Redirect and header fidelity

Both clients expose redirect configuration. OkHttp needs both
`followRedirects` and `followSslRedirects` so same-scheme and cross-scheme
redirects follow the same cURL intent. Ktor sets `followRedirects` on its client.

Neither target has to reject duplicate headers: their builder methods append.
That makes Kotlin a useful destination for APIs that intentionally repeat a
field rather than using a comma-separated value.

## Bodies and uploads

Already serialized JSON and form data stay serialized. OkHttp wraps the exact
string in a `RequestBody`; Ktor passes it to `setBody`. File paths remain local
file operations in the generated program and are never accessed by the web app.

OkHttp's multipart builder streams file request bodies. Ktor's generated
multipart form reads file bytes because that stable API expects the part value;
for very large uploads, adapt it to the engine's streaming multipart facilities.
