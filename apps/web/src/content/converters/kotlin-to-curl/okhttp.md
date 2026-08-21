---
direction: code-to-curl
slug: kotlin-to-curl/okhttp
parent: kotlin-to-curl
title: Kotlin OkHttp to cURL Converter | CurlToCode
description: Convert Kotlin OkHttp code to a cURL command, reading Request.Builder, toRequestBody media types, Credentials.basic, and MultipartBody parts statically.
heading: Convert Kotlin OkHttp to a cURL command
eyebrow: OkHttp parser
lede: Read an OkHttp builder chain written in Kotlin and recover the request, media type and credentials included.
language: kotlin
client: okhttp
languageLabel: Kotlin
clientLabel: OkHttp
order: 1651
faqs:
  - question: How is the request body's media type recovered?
    answer: From toRequestBody, whose argument is the media type. OkHttp attaches the type to the body rather than to a header, so that call is the only place it appears.
  - question: Are Credentials.basic values read as real credentials?
    answer: Yes. The call is lifted out of the Authorization header it was passed to, so the converted command carries a username and password rather than a base64 blob.
  - question: How is the redirect policy found?
    answer: From followRedirects on the client builder. OkHttp follows by default, so a client that says nothing converts to a command with -L.
related:
  - kotlin-to-curl
  - kotlin-to-curl/ktor
  - curl-to-kotlin/okhttp
  - java-to-curl/okhttp
---

## The builder, in Kotlin form

`Request.Builder().url(...).method(verb, body)` is the same chain the Java
reader handles. What differs is how the pieces are made: Kotlin uses extension
functions, so a body is `"text".toRequestBody(...)` rather than
`RequestBody.create(...)`.

Both `addHeader` and `header` are read, and the difference is kept:
`addHeader` appends, so a repeated name survives, while `header` replaces.

## Media types live on the body

This is the detail that most often gets lost. OkHttp has no content-type
header in the builder; the type is the argument to `toRequestBody`. A reader
that only looked at `addHeader` calls would convert a JSON request into an
untyped one.

## Multipart

`MultipartBody.Builder().addFormDataPart(name, value)` supplies the parts, in
order, so a form with a repeated field name converts intact.
