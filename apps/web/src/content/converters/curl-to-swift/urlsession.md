---
slug: curl-to-swift/urlsession
parent: curl-to-swift
title: cURL to Swift URLSession Converter | CurlToCode
description: Convert cURL to dependency-free Swift URLSession and URLRequest code with exact bodies, no-follow delegates, multipart bytes, files, and headers.
heading: Convert cURL to Swift URLSession
eyebrow: Foundation networking
lede: Generate async Foundation request code that runs without a package and uses a real task delegate when redirects must be declined.
language: swift
client: urlsession
languageLabel: Swift
clientLabel: URLSession
order: 321
faqs:
  - question: Does URLSession need an external dependency?
    answer: No. URLSession, URLRequest, Data, and URL are part of Foundation. The generated async data method requires a modern Swift concurrency-capable deployment target.
  - question: Why not set a redirect property on URLRequest?
    answer: URLRequest has no such property. Redirect decisions happen through URLSessionTaskDelegate, so a generated NoRedirects delegate is necessary when the cURL command omitted -L.
  - question: Why are repeated header names rejected?
    answer: URLRequest folds values added under one name into a comma-separated field. That transformation is not valid for every header, so the converter does not claim the repeated fields survived unchanged.
related:
  - curl-to-swift
  - curl-to-swift/alamofire
  - curl-to-objectivec
  - curl-to-dart/http
---

## A complete URLRequest

The output creates a `URLRequest`, assigns `httpMethod`, and writes each header
through `setValue`. Serialized content becomes UTF-8 `Data`; file-backed content
uses `Data(contentsOf:)` on a file URL.

The request is sent with the async `URLSession.data(for:)` API and the resulting
bytes are decoded as UTF-8 for a runnable example. Keep the returned
`URLResponse` when integrating status and header handling.

## Declining redirects correctly

URLSession follows redirects automatically. For a command without `-L`, the
generated `NoRedirects` task delegate calls its completion handler with `nil`,
which returns the 3xx response rather than issuing the proposed next request.
With `-L`, shared session defaults are appropriate and the delegate is omitted.

## Multipart encoding

Foundation does not offer a high-level multipart form builder. The snippet
constructs the body from standards-shaped part headers, field bytes, file bytes,
and a fixed boundary, then sets the matching `Content-Type` itself. Boundary
collisions are checked before source is generated.

For a large file or an application that already uses an upload abstraction,
[Alamofire](/curl-to-swift/alamofire) avoids buffering the full multipart body in
one `Data` value.
