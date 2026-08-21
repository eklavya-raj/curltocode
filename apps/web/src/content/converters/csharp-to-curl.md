---
direction: code-to-curl
slug: csharp-to-curl
title: C# to cURL – HttpClient & RestSharp Converter | CurlToCode
description: Convert static C# requests to cURL locally, reading HttpRequestMessage construction and RestSharp chains including headers, bodies, multipart, and redirects.
heading: Convert C# to cURL
eyebrow: C# HTTP parser
lede: Turn a C# HttpClient or RestSharp request into a conventional cURL command, without running the program or contacting the endpoint it names.
language: csharp
client: httpclient
languageLabel: C#
clientLabel: HttpClient
order: 170
faqs:
  - question: Which C# HTTP clients can be converted?
    answer: HttpClient through HttpRequestMessage, its content classes, and header collections, plus RestSharp's RestRequest with AddHeader, AddJsonBody, AddStringBody, and AddBody.
  - question: Does CurlToCode run the code to work out the request?
    answer: No. Conversion is entirely static. Imports, helper methods, environment access, and the represented HTTP request are never executed, so nothing reaches a server.
  - question: What happens to a value the parser cannot resolve?
    answer: It is reported with the expression responsible rather than replaced by a guess. A URL from a helper call or a header built at run time produces a named limitation instead of an invented command.
related:
  - csharp-to-curl/httpclient
  - csharp-to-curl/restsharp
  - csharp-to-curl/flurl
  - curl-to-csharp
  - java-to-curl
---

## Reading a builder chain

C# expresses a request as a chain of calls, so the parser reads them in order
and folds them together rather than looking for a single expression. Literals,
values assigned once, and static string concatenation are resolved; anything
else is reported.

C# mixes constructor arguments, property assignments, and method calls in one request, so all three are read. A MultipartFormDataContent adds its parts content-first and name-second, which is the reverse of every header setter, and that ordering is respected.

## What cannot be resolved safely

A URL returned by a helper, a header computed at run time, or a value read from
configuration cannot be known without executing the program. Each is reported
with the expression that caused it, which is more useful than a command that
looks complete but is wrong.
