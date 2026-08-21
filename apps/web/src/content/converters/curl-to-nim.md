---
slug: curl-to-nim
title: cURL to Nim HttpClient Converter | CurlToCode
description: Convert cURL to Nim HttpClient code with repeated headers, exact bodies, redirect limits, authentication, multipart fields, cookies, and file uploads.
heading: Convert cURL to Nim
eyebrow: Nim standard-library HTTP
lede: Generate dependency-free Nim requests with sequence-valued headers, multipart data, and a redirect budget matching the cURL command.
language: nim
client: httpclient
languageLabel: Nim
clientLabel: HttpClient
order: 103
faqs:
  - question: Does Nim output require a package?
    answer: No. HttpClient, HttpHeaders, MultipartData, and file helpers come from Nim's standard library.
  - question: Can Nim keep repeated request headers?
    answer: Yes. HttpHeaders.add stores a sequence of values for a name, so repeated entries remain represented.
  - question: How are redirects bounded?
    answer: The generated client receives zero redirects without -L and a finite standard budget when the command opted into following.
related:
  - curl-to-crystal
  - curl-to-ocaml
  - curl-to-c
  - curl-to-rust
---

## Standard-library request code

Nim's `HttpClient` supplies a generic request method, headers, body values, and
multipart data without another dependency. The generated source constructs the
client with an explicit redirect limit, then prints the response body.

`HttpHeaders.add` retains same-name values as a sequence, making the target more
faithful than a plain table-based API.

## Bodies and multipart

Serialized content stays a string. A file body is opened by the generated Nim
program, while multipart forms use `MultipartData` entries for fields and files.
The library creates the boundary and matching header.

Conversion remains entirely local: the browser never resolves the path or sends
the request.
