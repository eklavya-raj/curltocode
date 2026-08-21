---
slug: curl-to-csharp/flurl
parent: curl-to-csharp
title: cURL to C# Flurl.Http Converter | CurlToCode
description: Convert cURL to fluent C# Flurl.Http code with custom methods, exact bodies, file streams, multipart parts, authentication, redirects, and status handling.
heading: Convert cURL to C# Flurl.Http
eyebrow: Fluent .NET HTTP
lede: Generate readable Flurl chains with per-request redirect settings, native multipart calls, and HTTP error responses left inspectable.
language: csharp
client: flurl
languageLabel: C#
clientLabel: Flurl.Http
order: 85
faqs:
  - question: Why does Flurl output call AllowAnyHttpStatus?
    answer: Flurl normally throws for non-success responses, while cURL usually returns them. Allowing every status keeps the response available for GetStringAsync without masking transport failures.
  - question: Can Flurl send a custom HTTP method?
    answer: Yes. Named methods use HttpMethod constants and an extension verb becomes new HttpMethod with the exact token, then goes through SendAsync or SendMultipartAsync.
  - question: How does the generator handle files?
    answer: Raw file bodies use File.OpenRead and StreamContent. Multipart files use AddFile with the path, filename, and optional content type through Flurl's upload builder.
related:
  - curl-to-csharp
  - curl-to-csharp/httpclient
  - curl-to-csharp/restsharp
  - curl-to-nodejs/got
---

## A fluent wrapper over HttpClient

The generated code starts from the URL string and adds headers, authentication,
redirect settings, and status policy before selecting the send operation. Flurl
manages its underlying `HttpClient` lifecycle, avoiding a common source of
socket exhaustion in hand-written snippets.

`.AllowAnyHttpStatus()` preserves completed error responses. Redirects are set
per request from the presence of `-L`, so the converted call does not inherit an
unseen global default.

## Exact content and uploads

Serialized payloads use `StringContent` with their media type and UTF-8 bytes.
Raw files use a stream. Multipart output selects `SendMultipartAsync` and adds
text or file parts through the content builder.

The multipart builder owns its boundary. A body-level `Content-Type` belongs on
the content rather than being duplicated in request headers.

## Duplicate header limitation

Flurl's `WithHeader` replaces the current value for the same name. Because
joining or choosing one value could change semantics, repeated names return a
clear limitation. Raw HttpClient code is the stronger target when the request
depends on lower-level header control.

Install with `dotnet add package Flurl.Http`.
