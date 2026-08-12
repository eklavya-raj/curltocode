---
slug: curl-to-java
title: cURL to Java – JDK, OkHttp & Apache HttpClient | CurlToCode
description: Convert cURL to Java using JDK HttpClient, OkHttp, or Apache HttpClient 5, preserving bodies, headers, cookies, auth, redirects, and uploads.
heading: Convert cURL to Java
eyebrow: Java HTTP clients
lede: Generate compilable Java for the JDK client, OkHttp, or Apache HttpClient 5, with each library's real capabilities and limitations made explicit.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 30
faqs:
  - question: Which Java HTTP client should I choose?
    answer: JDK HttpClient needs no dependency, OkHttp offers an ergonomic modern API and interceptors, and Apache HttpClient 5 provides extensive classic-client configuration and mature multipart support. Prefer the client already standardized in your codebase.
  - question: Why does the multipart example fail for HttpClient?
    answer: Because java.net.http has no multipart BodyPublisher. Building the boundary and part headers by hand is error-prone, so rather than emit fragile code the converter reports the limitation and points you at the OkHttp output, which supports multipart natively.
  - question: Why does the generated code wrap everything in a Main class?
    answer: Both clients throw checked exceptions when a request is executed. The statements are placed inside a main method declared with throws Exception so the snippet compiles as written with javac rather than being a fragment you have to repair.
related:
  - curl-to-java/apache-httpclient
  - curl-to-csharp
  - curl-to-go
  - curl-to-rust
---

## Three clients, three sets of trade-offs

The JDK client is built into Java 11 and later, so a request needs no build
configuration at all. It covers ordinary JSON, text, form, and file bodies well.
Its gap is multipart: there is no `BodyPublisher` for it.

OkHttp adds a dependency but handles multipart natively through
`MultipartBody.Builder`, and its `Request.Builder` API is generally more
ergonomic. Both outputs preserve the same normalized request, so switching
between them does not change what goes over the wire.

Apache HttpClient 5 uses `HttpUriRequestBase`, so arbitrary method strings and
entities share one path. Its `MultipartEntityBuilder` covers uploads while the
response-handler form ensures response entities release their connections.

## Restricted headers

`java.net.http` refuses to set a set of headers it manages itself — among them
`Host`, `Connection`, `Content-Length`, `Date`, and `Upgrade`. Attempting to set
one throws `IllegalArgumentException` at runtime unless the JVM was started with
`-Djdk.httpclient.allowRestrictedHeaders`.

Rather than generate code that compiles and then fails on execution, the
converter detects a restricted header in your command and reports it up front.
OkHttp has no such restriction, so it is the usable path when you genuinely need
to override one of those headers.

## Common conversion issues

**Redirect defaults differ between clients.** The JDK client defaults to never
following redirects, while OkHttp follows them. The generated code states the
policy explicitly for both clients so `-L` has the same meaning whichever target
you select.

**`response.body()` is a stream you must close in OkHttp.** The generated code
uses a try-with-resources block. Reading the body outside that block, or reading
it twice, throws.

**`.header()` differs from `.setHeader()`.** The generated code uses the
appending form on both clients so repeated header names survive, matching cURL's
behaviour.
