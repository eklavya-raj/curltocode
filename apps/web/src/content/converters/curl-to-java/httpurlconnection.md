---
slug: curl-to-java/httpurlconnection
parent: curl-to-java
title: cURL to Java HttpURLConnection | CurlToCode
description: Convert cURL to dependency-free Java HttpURLConnection code with redirects, repeated headers, exact bodies, multipart files, auth, and error streams.
heading: Convert cURL to Java HttpURLConnection
eyebrow: Legacy JDK and Android HTTP
lede: Generate the long-standing JDK connection API for older Java and Android baselines, with unsupported methods such as PATCH rejected clearly.
language: java
client: httpurlconnection
languageLabel: Java
clientLabel: HttpURLConnection
order: 35
faqs:
  - question: Why can HttpURLConnection not send PATCH?
    answer: Its setRequestMethod implementation accepts a fixed historical verb set and throws ProtocolException for PATCH and extension methods. The converter reports that runtime restriction instead of using reflection or generating failing code.
  - question: Does HttpURLConnection preserve duplicate headers?
    answer: Yes. The generated code uses addRequestProperty, which appends another value. Using setRequestProperty would replace the previous value and change the request.
  - question: Why read getErrorStream for a 4xx response?
    answer: getInputStream throws for many HTTP error statuses. Selecting getErrorStream after inspecting the status makes the response body available, which better matches cURL's normal behaviour.
related:
  - curl-to-java
  - curl-to-java/httpclient
  - curl-to-java/okhttp
  - curl-to-kotlin/okhttp
---

## The compatibility target

`HttpURLConnection` has existed since early Java and remains relevant to old
JDK baselines and Android code without another client. The output opens the
connection from a `URI`, assigns its request method, controls redirects, and
adds headers one at a time.

The class has a hard-coded method allowlist. `PATCH` and custom verbs throw at
runtime, so CurlToCode refuses them. JDK `HttpClient`, OkHttp, and Apache
HttpClient are the better choices when arbitrary methods are required.

## Bodies and repeated fields

`addRequestProperty` preserves repeated header names. Body bytes are written in
a try-with-resources block. Files use `Files.copy`, and multipart input writes
part headers and files to the connection's output stream with a matching
boundary.

## Reading successful and error responses

The generated code checks `getResponseCode()` before choosing the input or error
stream. That prevents a 4xx or 5xx response from hiding its body behind an
exception. The selected stream is closed through try-with-resources.

No external dependency is needed, but the API is substantially lower-level than
modern alternatives.
