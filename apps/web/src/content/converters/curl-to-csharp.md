---
slug: curl-to-csharp
title: cURL to C# Converter – HttpClient | CurlToCode
description: Convert cURL commands to C# HttpClient code. Headers, JSON bodies, forms, multipart uploads, cookies, and basic auth map onto HttpRequestMessage correctly.
heading: Convert cURL to C#
eyebrow: .NET HttpClient
lede: Generate HttpClient code that puts each header on the right object, so your request compiles and runs instead of throwing at the first content header.
language: csharp
client: httpclient
languageLabel: C#
clientLabel: HttpClient
order: 80
faqs:
  - question: Why are some headers set on request.Content instead of request.Headers?
    answer: .NET splits HTTP headers between the message and its content. Adding Content-Type to HttpRequestMessage.Headers throws InvalidOperationException at runtime. The converter routes Content-Type, Content-Disposition, Expires, Last-Modified and the other entity headers onto the content object where .NET expects them.
  - question: Why does the handler set UseCookies to false?
    answer: Only when the command carried cookies. HttpClientHandler maintains its own cookie container by default, which can add or drop cookies behind your back. Disabling it makes the explicit Cookie header authoritative, matching what cURL sends.
  - question: Does this code work in a console app as written?
    answer: Yes. It uses top-level statements and await, which .NET 6 and later support in Program.cs without a wrapping class or an explicit async Main.
related:
  - curl-to-java
  - curl-to-go
  - curl-to-typescript
---

## How the C# output is structured

The generated code creates an `HttpClient`, builds an `HttpRequestMessage` with
an explicit `HttpMethod`, applies headers, attaches content when there is a body,
and awaits `SendAsync`. Every disposable is declared with a `using` declaration
so it is released at the end of scope.

A handler is only introduced when it is needed — to disable automatic redirects,
to turn off the cookie container, or both. Requests that need neither construct
`HttpClient` directly.

## The header split that breaks most hand-written code

This is the single most common failure when moving a request from cURL to .NET.
`HttpRequestMessage.Headers` accepts general and request headers, while entity
headers such as `Content-Type` and `Content-Length` belong on
`HttpContent.Headers`. Putting one in the wrong place throws at runtime rather
than at compile time.

The converter classifies each header and emits it against the right object.
Values are added with `TryAddWithoutValidation`, which preserves repeated names
and accepts values .NET's strict parser would otherwise reject.

## Common conversion issues

**`StringContent` sets a media type you did not ask for.** Its constructor
defaults to `text/plain; charset=utf-8`. The generated code removes and re-adds
`Content-Type` afterwards so the value from your command wins.

**One `HttpClient` per request is an anti-pattern in production.** These snippets
create a client inline for clarity. In a real service, reuse a single instance or
resolve one from `IHttpClientFactory` to avoid socket exhaustion.

**`SendAsync` does not throw on a 4xx or 5xx.** Check `IsSuccessStatusCode` or
call `EnsureSuccessStatusCode` if you want the failure to surface as an
exception.
