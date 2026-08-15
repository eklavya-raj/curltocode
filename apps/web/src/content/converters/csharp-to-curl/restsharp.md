---
direction: code-to-curl
slug: csharp-to-curl/restsharp
parent: csharp-to-curl
title: RestSharp to cURL Command Converter | CurlToCode
description: Convert RestSharp requests back into a cURL command, reading RestRequest construction, AddHeader, AddJsonBody, AddStringBody, and AddBody with its media type.
heading: Convert C# RestSharp to a cURL command
eyebrow: RestSharp parser
lede: Read a RestSharp request and recover the equivalent cURL command, resolving its chained calls without creating a client or sending anything.
language: csharp
client: restsharp
languageLabel: C#
clientLabel: RestSharp
order: 172
faqs:
  - question: Which RestSharp calls are read?
    answer: RestRequest supplies the resource and optionally the method, AddHeader adds a field, and AddJsonBody, AddStringBody, and AddBody each supply the payload.
  - question: How does the media type reach the generated command?
    answer: AddStringBody and AddBody name their media type in the second argument, and AddJsonBody implies a JSON one. That type decides how the payload is represented.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - csharp-to-curl/httpclient
  - csharp-to-curl
  - curl-to-csharp/restsharp
  - go-to-curl/resty
---

## The request chain

`new RestRequest(resource)` supplies the URL, and a `Method.X` argument supplies
the verb when present. `AddHeader` adds fields, and the body setters each carry
their own media type, which is what decides the representation.

## Bodies

`AddJsonBody` implies a JSON content type. `AddStringBody` and `AddBody` name
theirs explicitly, so an opaque type yields bytes rather than text.

## Redirects

RestSharp follows redirects unless its options disable them, so the redirect
flag is omitted only when `FollowRedirects = false` appears.
