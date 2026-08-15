---
slug: curl-to-java/httpclient
parent: curl-to-java
title: cURL to Java HttpClient Converter | CurlToCode
description: Convert cURL commands to java.net.http.HttpClient code with no dependencies, including JSON bodies, forms, file bodies, cookies, and basic authentication.
heading: Convert cURL to Java HttpClient
eyebrow: JDK 11 and later
lede: Generate compilable code for the HTTP client built into the JDK, with no build configuration and no third-party libraries.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 31
faqs:
  - question: Which Java version do I need?
    answer: Java 11 or later. java.net.http was standardised in Java 11 and has been present in every release since, so the generated code compiles on any currently supported JDK without a dependency.
  - question: Why can't it produce multipart uploads?
    answer: The JDK provides no multipart BodyPublisher. Constructing the boundary and per-part headers by hand is easy to get subtly wrong, so the converter reports the limitation instead and points you to the OkHttp output, which supports multipart directly.
  - question: What happens with headers like Host or Content-Length?
    answer: The client refuses to set them and throws IllegalArgumentException at runtime unless the JVM is started with the allowRestrictedHeaders system property. The converter detects those headers in your command and reports the problem before you run anything.
related:
  - curl-to-java/okhttp
  - curl-to-java
  - curl-to-csharp
  - java-to-curl/httpclient
---

## HttpClient-specific output

The generated code builds an immutable `HttpClient` with an explicit redirect
policy, then an `HttpRequest` through its builder. The `method` builder call is
used uniformly rather than the `GET`/`POST` shortcuts, so every verb — including
`PATCH`, which the shortcuts do not cover — is expressed the same way.

Because `client.send` throws `IOException` and `InterruptedException`, the
statements are wrapped in a `Main` class whose `main` method declares
`throws Exception`. That makes the snippet compile as written with `javac`
instead of being a fragment you have to repair first.

## Bodies

Bodies use `HttpRequest.BodyPublishers`. String content becomes `ofString`, and a
file body becomes `ofFile` with a `Path`, which streams from disk rather than
loading the whole file into memory. A request with no body uses `noBody()`.

Responses are read with `HttpResponse.BodyHandlers.ofString()`. For a large or
binary response, switch that to `ofInputStream` or `ofByteArray`.

## Common conversion issues

**The redirect policy is explicit.** `HttpClient` defaults to `NEVER`, which
matches cURL without `-L`. The generated code still states `NORMAL` or `NEVER`
so the behavior is visible and remains correct if you reuse the builder.

**`HttpClient` instances are meant to be reused.** Creating one per request, as
these snippets do for clarity, wastes its connection pool. In a service, build
one and share it.

**`ofString` uses UTF-8.** If your body needs a different charset you must pass
one explicitly; the default will not match a `Content-Type` that declares
something else.
