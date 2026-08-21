---
slug: curl-to-java
title: cURL to Java – 4 HTTP Clients | CurlToCode
description: Convert cURL to Java using JDK HttpClient, OkHttp, Apache HttpClient 5, or HttpURLConnection, preserving supported bodies, headers, auth, and redirects.
heading: Convert cURL to Java
eyebrow: Java HTTP clients
lede: Generate compilable Java for modern libraries or older HttpURLConnection baselines, with each client's real capabilities and limitations made explicit.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 30
faqs:
  - question: Which Java HTTP client should I choose?
    answer: JDK HttpClient needs no dependency on Java 11+, OkHttp offers an ergonomic modern API, Apache HttpClient 5 provides deep configuration and multipart support, and HttpURLConnection covers older Java or Android baselines with a restricted method set.
  - question: Why does the multipart example fail for HttpClient?
    answer: Because java.net.http has no multipart BodyPublisher. Building the boundary and part headers by hand is error-prone, so rather than emit fragile code the converter reports the limitation and points you at the OkHttp output, which supports multipart natively.
  - question: Why does the generated code wrap everything in a Main class?
    answer: Both clients throw checked exceptions when a request is executed. The statements are placed inside a main method declared with throws Exception so the snippet compiles as written with javac rather than being a fragment you have to repair.
related:
  - curl-to-java/httpurlconnection
  - curl-to-java/apache-httpclient
  - curl-to-csharp
  - curl-to-go
  - curl-to-rust
  - java-to-curl
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
