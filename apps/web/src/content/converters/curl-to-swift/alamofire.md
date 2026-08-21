---
slug: curl-to-swift/alamofire
parent: curl-to-swift
title: cURL to Swift Alamofire Converter | CurlToCode
description: Convert cURL to Alamofire Swift code with native file and multipart uploads, redirect policy, raw request bytes, headers, auth, and response validation.
heading: Convert cURL to Swift Alamofire
eyebrow: High-level Swift networking
lede: Generate Alamofire requests and uploads that preserve raw payloads while using the library's native redirect and multipart facilities.
language: swift
client: alamofire
languageLabel: Swift
clientLabel: Alamofire
order: 322
faqs:
  - question: Why does raw data use a URLRequest instead of parameters?
    answer: Alamofire's parameter encoders serialize values. The cURL body is already serialized, so attaching its bytes to URLRequest avoids a second pass that could alter formatting or form encoding.
  - question: How are redirects controlled in Alamofire?
    answer: Each generated request applies either the follow or doNotFollow Redirector. This makes the difference between a command with and without -L visible on the request itself.
  - question: Which Alamofire version does the generated package line use?
    answer: The Swift Package Manager dependency starts from Alamofire 5.12.0, matching the request, upload, redirect, validation, and async serialization APIs in the snippet.
related:
  - curl-to-swift
  - curl-to-swift/urlsession
  - curl-to-kotlin/okhttp
  - curl-to-dart/dio
---

## Native request and upload paths

Requests without a body go through `AF.request`. A raw serialized body is placed
on a `URLRequest` before Alamofire receives it, preventing parameter encoding
from changing the bytes. A raw file uses `AF.upload` with a file URL.

Multipart input uses `AF.upload(multipartFormData:)`: text fields append UTF-8
data and file fields retain the submitted name, filename, and optional media
type. Alamofire owns the multipart boundary.

## Redirect and status policy

The generated chain adds `.redirect(using: .follow)` for `-L` and
`.doNotFollow` otherwise. This is preferable to inheriting URLSession's follow
default, which would send an extra request absent from the original command.

`.validate()` applies Alamofire's normal response validation. The example awaits
`serializingData().value`, so an invalid HTTP status throws. Adapt that response
policy if the calling code must inspect error-status bodies exactly as cURL does.

## Header limitations

Alamofire's `HTTPHeaders` treats names as case-insensitively unique. Repeating a
name replaces its earlier value, so CurlToCode reports duplicates rather than
silently choosing one. Authentication and cookies are otherwise emitted as
their corresponding request headers.

Add the Alamofire package from version `5.12.0` or later.
