---
slug: curl-to-java/apache-httpclient
parent: curl-to-java
title: cURL to Apache HttpClient 5 Converter | CurlToCode
description: Convert cURL commands to Java Apache HttpClient 5.6 code with generic methods, repeated headers, exact bodies, redirects, and multipart file uploads.
heading: Convert cURL to Apache HttpClient 5
eyebrow: Apache HttpComponents
lede: Generate compilable Apache HttpClient 5 code using HttpUriRequestBase, explicit redirect configuration, response handlers, and supported entity types.
language: java
client: apache
languageLabel: Java
clientLabel: Apache HttpClient
order: 33
faqs:
  - question: Which Apache HttpClient generation is this output for?
    answer: It targets HttpComponents Client 5.6 and uses the client5 package names. Those imports are intentionally different from the older org.apache.http packages used by HttpClient 4.x.
  - question: Can Apache HttpClient send custom HTTP methods with bodies?
    answer: Yes. HttpUriRequestBase accepts a method string and an entity, so the generator can represent extension methods without choosing a method-specific request subclass.
  - question: Why does the code use a response handler?
    answer: The classic client documentation recommends response handlers because they consume and release response entities consistently. The generated handler prints the status and body before returning.
related:
  - curl-to-java/httpclient
  - curl-to-java/okhttp
  - curl-to-java
---

## HttpClient 5 request model

The output uses `HttpUriRequestBase` rather than a `HttpGet` or `HttpPost`
subclass. That gives every standard or custom method the same construction path
and allows an entity whenever the normalized request contains a body.

Headers are applied with `addHeader`, preserving repeated values. Basic
credentials and cookies are materialized as headers because that accurately
represents this isolated request without configuring a shared credentials or
cookie store.

## Entities and multipart bodies

Textual bodies are converted to explicit UTF-8 bytes and wrapped in a
`ByteArrayEntity`; file bodies use `FileEntity`. The original `Content-Type`
remains a request header, avoiding a second serialization step.

Multipart requests are built with `MultipartEntityBuilder`. Text fields use
`addTextBody`, while files use `addBinaryBody` with the cURL filename and part
media type. The entity creates its own boundary, so an externally supplied
multipart content header cannot be reused safely.

## Version and lifecycle details

**Client 5 packages are not Client 4 packages.** Use
`org.apache.httpcomponents.client5:httpclient5`; imports begin with
`org.apache.hc`, not `org.apache.http`.

**Close the classic client.** The generated try-with-resources block releases
its connection manager after the example completes.

**Redirects are a client configuration.** `setRedirectsEnabled` is written from
the cURL `-L` state so the library's default cannot silently change the request.
