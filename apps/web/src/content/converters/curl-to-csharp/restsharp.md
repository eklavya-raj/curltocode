---
slug: curl-to-csharp/restsharp
parent: curl-to-csharp
title: cURL to C# RestSharp Converter | CurlToCode
description: Convert cURL commands to current C# RestSharp code with exact string bodies, authentication, headers, redirects, multipart fields, and named file uploads.
heading: Convert cURL to C# RestSharp
eyebrow: RestSharp for .NET
lede: Generate current RestSharp request code instead of the obsolete pre-v107 patterns still found in many copied snippets and older code generators.
language: csharp
client: restsharp
languageLabel: C#
clientLabel: RestSharp
order: 81
faqs:
  - question: Which RestSharp API generation does this output use?
    answer: It targets the current v114 API with RestClientOptions, RestRequest, AddStringBody, AddFile, and ExecuteAsync. It does not emit the obsolete IRestRequest or AddParameter request-body patterns.
  - question: Why is Content-Type passed with the body instead of as a header?
    answer: RestSharp treats Content-Type as content metadata and documents that it should be supplied through the body API. Adding it as an ordinary request header can be ignored or produce an invalid request.
  - question: Are custom HTTP extension methods supported?
    answer: RestSharp exposes a fixed Method enum. The converter supports its defined methods and reports an explicit limitation for values such as PURGE instead of substituting a different verb.
related:
  - curl-to-csharp
  - curl-to-csharp/httpclient
  - curl-to-java/apache-httpclient
  - curl-to-typescript
  - csharp-to-curl/restsharp
---

## Current RestSharp output

RestSharp changed substantially after v106, so examples using
`IRestRequest`, mutable client settings, or a request-body `AddParameter` call
are no longer reliable. The generated source uses `RestClientOptions`, creates a
`RestRequest` with the correct `Method` value, and awaits `ExecuteAsync`.

Redirect handling belongs to the client options and is set explicitly from
cURL's `-L`. General headers use `AddHeader`; `Content-Type` is removed from that
list and supplied to the body API where RestSharp expects it.

## Bodies and file uploads

JSON, text, and URL-encoded bodies use `AddStringBody`, preserving the original
serialized string. Binary data uses `AddBody` with bytes rather than asking a
serializer to interpret it.

Multipart requests set `AlwaysMultipartFormData`. Text parts use request
parameters, while file parts use the byte-array `AddFile` overload so a posted
filename that differs from the local path is retained alongside the part media
type.

## RestSharp limitations to know

**The method set is finite.** Standard methods plus RestSharp's `MERGE`, `COPY`,
and `SEARCH` values are supported; arbitrary method tokens are reported.

**Do not add multipart Content-Type manually.** RestSharp creates the boundary
when it serializes files and parameters.

**Reuse clients in real applications.** The standalone snippet owns one client,
but services should generally register RestSharp or its underlying HttpClient
through their normal dependency-injection lifetime.
