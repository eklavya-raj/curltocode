---
slug: curl-to-csharp/httpclient
parent: curl-to-csharp
title: cURL to C# HttpClient Converter | CurlToCode
description: Convert cURL commands to modern C# HttpClient code with AllowAutoRedirect control, repeated headers, multipart uploads, and no NuGet packages required.
heading: Convert cURL to C# HttpClient
eyebrow: .NET standard library
lede: Generate HttpRequestMessage-based code using only the .NET base class library, with redirect behaviour and content headers set explicitly rather than inferred.
language: csharp
client: httpclient
languageLabel: C#
clientLabel: HttpClient
order: 82
faqs:
  - question: Why HttpRequestMessage instead of client.GetAsync or PostAsync?
    answer: The convenience methods cover a fixed set of verbs and cannot express an arbitrary method token, which cURL allows through -X. HttpRequestMessage handles any method and keeps headers, content, and content headers separate in the way .NET actually models them, so the generated request matches the command exactly.
  - question: Why is TryAddWithoutValidation used for headers?
    answer: .NET validates header values against its own rules and will throw on values that a server accepts happily. TryAddWithoutValidation sends what the original command sent. It also appends rather than replaces, so repeated header names survive intact.
  - question: Should I create a new HttpClient for every request?
    answer: No, and this is the classic .NET pitfall. Each instance holds its own connection pool, so creating them per request exhausts sockets under load. The generated snippet is a self-contained example; in an application, register a single client through IHttpClientFactory and reuse it.
related:
  - curl-to-csharp
  - curl-to-csharp/restsharp
  - curl-to-java/httpclient
  - csharp-to-curl/httpclient
---

## Base class library only

The output uses `HttpRequestMessage` with `HttpClient.SendAsync` and needs no
NuGet package — everything comes from `System.Net.Http` in the .NET base class
library. Top-level statements and `using var` declarations keep it short enough
to paste into a console project or a LINQPad query and run.

`HttpRequestMessage` is used rather than `GetAsync`/`PostAsync` because those
helpers cover a fixed set of verbs. cURL allows any method token through `-X`,
and only the message form can express that.

## Redirects and the two kinds of header

`HttpClient` follows redirects by default; cURL does not without `-L`. To match,
the generated code wraps the client in
`new HttpClientHandler { AllowAutoRedirect = false }`. When your command has
`-L`, the handler is dropped entirely and .NET's default following applies —
which is why the output for a `-L` command is a line shorter.

.NET splits headers into request headers and content headers, and putting one in
the other's collection throws. The generator routes each to the right place:
`Content-Type` and `Content-Length` onto `request.Content.Headers`, everything
else onto `request.Headers`. `TryAddWithoutValidation` is used throughout,
because .NET's validation rejects values that real servers accept, and because
it appends rather than replaces so repeated header names survive.

## Bodies and uploads

A raw or JSON body becomes `StringContent` with UTF-8 encoding. `StringContent`
attaches its own `Content-Type` including a charset, so the generator removes
that and sets the header from your command — otherwise a request declaring
`application/json` would go out as `application/json; charset=utf-8`, which some
strict APIs reject.

Multipart uploads use `MultipartFormDataContent`, with text fields as
`StringContent` and files read through `File.ReadAllBytes` into a
`ByteArrayContent` carrying the declared media type and posted filename.

## Current HttpClient limitations

**Content headers with no body are rejected.** If a command sets `Content-Type`
on a request that has no body, there is no `HttpContent` object to attach it to.
Rather than invent an empty one and change what gets sent, the converter reports
the limitation.

**Do not copy the client lifetime into production.** `using var client = new
HttpClient(...)` is right for a self-contained example and wrong in an
application: each instance owns a connection pool, and creating them per request
exhausts sockets. Use `IHttpClientFactory`.
