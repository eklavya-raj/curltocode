---
direction: code-to-curl
slug: java-to-curl/okhttp
parent: java-to-curl
title: OkHttp to cURL Command Converter | CurlToCode
description: Convert OkHttp Request.Builder chains back into a cURL command, reading url, method, addHeader, RequestBody payloads, and multipart form parts statically.
heading: Convert Java OkHttp to a cURL command
eyebrow: OkHttp parser
lede: Read an OkHttp request builder and recover the equivalent cURL command, following the chain without building a client or issuing a call.
language: java
client: okhttp
languageLabel: Java
clientLabel: OkHttp
order: 162
faqs:
  - question: Which OkHttp calls are read?
    answer: url supplies the URL, method supplies the verb and body, and addHeader appends a field. MultipartBody.Builder parts added with addFormDataPart are collected in order.
  - question: How is the request body recovered?
    answer: RequestBody.create is read through to the payload it wraps. The representation then follows the declared content type, so a JSON media type yields a JSON body and an opaque one yields bytes.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - java-to-curl/httpclient
  - java-to-curl/apache
  - java-to-curl
  - curl-to-java/okhttp
---

## The Request.Builder chain

`url(...)` supplies the URL and `method(verb, body)` supplies the rest.
`addHeader` appends, which is what preserves a repeated header name across the
conversion.

## Multipart and redirects

Parts added through `addFormDataPart` are collected in call order, so field
order is preserved in the generated command.

OkHttp follows redirects by default, so the redirect flag appears unless the
client is built with `followRedirects(false)`.
