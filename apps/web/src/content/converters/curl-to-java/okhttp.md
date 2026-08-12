---
slug: curl-to-java/okhttp
parent: curl-to-java
title: cURL to Java OkHttp Converter | CurlToCode
description: Convert cURL commands to OkHttp code in your browser, including native multipart uploads, JSON bodies, forms, cookies, and basic authentication.
heading: Convert cURL to Java OkHttp
eyebrow: OkHttp client
lede: Generate OkHttp request code, the practical choice when you need multipart uploads that the JDK client cannot express.
language: java
client: okhttp
languageLabel: Java
clientLabel: OkHttp
order: 32
faqs:
  - question: When should I choose OkHttp over the built-in HttpClient?
    answer: When you need multipart uploads, interceptors, or fine-grained connection pool control. The JDK client covers ordinary JSON and form requests without a dependency, so OkHttp earns its place mainly through those capabilities.
  - question: Which OkHttp version does the generated code target?
    answer: OkHttp 5.3.2. The generated dependency guidance and Java API calls target the current stable release, including the RequestBody.create form where the content comes first and the media type second.
  - question: Why is the response wrapped in a try-with-resources block?
    answer: A Response holds a network connection until its body is closed. Without the block, a forgotten close leaks the connection out of the pool. It also means the body can only be read once, inside that scope.
related:
  - curl-to-java/httpclient
  - curl-to-java
  - curl-to-go
---

## OkHttp-specific output

The generated code builds an `OkHttpClient` with an explicit redirect policy,
composes a `Request` through its builder, and executes it inside a
try-with-resources block. Both `followRedirects` and `followSslRedirects` are
set, because OkHttp treats an HTTP-to-HTTPS redirect as a separate decision.

Headers use `addHeader` rather than `header`, so repeating a name appends another
value instead of replacing the previous one, matching what cURL sends.

## Multipart uploads

This is the reason to reach for OkHttp. A `MultipartBody.Builder` set to
`MultipartBody.FORM` collects the parts, text fields go through
`addFormDataPart`, and file parts add a `RequestBody` built from a `File` with
its media type. OkHttp generates the boundary and the `Content-Type` header
itself.

## Common conversion issues

**Prefer the current `RequestBody.create` argument order.** Older examples often
put the media type first. The generated Java uses the current content-first form,
which avoids relying on the legacy overload retained for compatibility.

**A null media type is legitimate.** When your command set `Content-Type`
explicitly, the generated code passes `null` to `RequestBody.create` and adds the
header separately, so the value is not set twice with different content.

**`response.body().string()` can only be called once.** It consumes the stream.
Assign it to a variable if you need the text more than once, and note that it
buffers the whole body into memory.
