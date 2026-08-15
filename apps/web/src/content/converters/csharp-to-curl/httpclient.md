---
direction: code-to-curl
slug: csharp-to-curl/httpclient
parent: csharp-to-curl
title: C# HttpClient to cURL Command | CurlToCode
description: Convert C# HttpRequestMessage code back into a cURL command, reading the constructor, header collections, content classes, and multipart form data statically.
heading: Convert C# HttpClient to a cURL command
eyebrow: HttpClient parser
lede: Read a C# HttpRequestMessage and recover the cURL command behind it, following its constructor, properties, and header calls without running the program.
language: csharp
client: httpclient
languageLabel: C#
clientLabel: HttpClient
order: 171
faqs:
  - question: Which HttpClient constructs are read?
    answer: The HttpRequestMessage constructor supplies the method and URL, TryAddWithoutValidation adds headers, and the Content property supplies the body through StringContent or ByteArrayContent.
  - question: How is a multipart request recovered?
    answer: MultipartFormDataContent adds each part with the content first and the field name second, the reverse of every header setter. That ordering is respected so names and values are not swapped.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - csharp-to-curl/restsharp
  - csharp-to-curl
  - curl-to-csharp/httpclient
  - java-to-curl/httpclient
---

## Constructor, properties, and calls

A single C# request spreads across three shapes: the `HttpRequestMessage`
constructor for the method and URL, property assignments such as `Content`, and
header calls on the request or its content. All three are read together.

Content classes are read through to their payload, and the representation
follows the declared media type.

## Redirects

The handler decides redirect behaviour. A handler constructed with
`AllowAutoRedirect = false` means the generated command carries no redirect flag.
