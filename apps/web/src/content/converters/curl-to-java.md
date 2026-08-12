---
slug: curl-to-java
title: cURL to Java Converter – HttpClient & OkHttp | CurlToCode
description: Convert cURL commands to Java code using the built-in HttpClient or OkHttp. Headers, JSON, forms, uploads, cookies, and basic auth are preserved.
heading: Convert cURL to Java
eyebrow: Java HTTP clients
lede: Generate compilable Java for the JDK's built-in HttpClient or for OkHttp, with the differences between them made explicit rather than hidden.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 30
faqs:
  - question: Should I use java.net.http.HttpClient or OkHttp?
    answer: HttpClient has been in the JDK since Java 11 and needs no dependency, which makes it the better default. Choose OkHttp when you need multipart uploads, connection pooling you can tune, or interceptors, since the built-in client has no multipart body publisher at all.
  - question: Why does the multipart example fail for HttpClient?
    answer: Because java.net.http has no multipart BodyPublisher. Building the boundary and part headers by hand is error-prone, so rather than emit fragile code the converter reports the limitation and points you at the OkHttp output, which supports multipart natively.
  - question: Why does the generated code wrap everything in a Main class?
    answer: Both clients throw checked exceptions when a request is executed. The statements are placed inside a main method declared with throws Exception so the snippet compiles as written with javac rather than being a fragment you have to repair.
related:
  - curl-to-csharp
  - curl-to-go
  - curl-to-rust
---

## Two clients, two sets of trade-offs

The JDK client is built into Java 11 and later, so a request needs no build
configuration at all. It covers ordinary JSON, text, form, and file bodies well.
Its gap is multipart: there is no `BodyPublisher` for it.

OkHttp adds a dependency but handles multipart natively through
`MultipartBody.Builder`, and its `Request.Builder` API is generally more
ergonomic. Both outputs preserve the same normalized request, so switching
between them does not change what goes over the wire.

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
