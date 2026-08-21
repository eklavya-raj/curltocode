---
slug: curl-to-objectivec
title: cURL to Objective-C NSURLSession Converter | CurlToCode
description: Convert cURL to Objective-C NSURLSession code with request methods, headers, exact bodies, authentication, multipart data, files, and redirect control.
heading: Convert cURL to Objective-C
eyebrow: Foundation networking for existing Apple code
lede: Generate NSMutableURLRequest and NSURLSession code for iOS and macOS projects that still use Objective-C, including an honest no-redirect delegate.
language: objectivec
client: nsurlsession
languageLabel: Objective-C
clientLabel: NSURLSession
order: 34
faqs:
  - question: Why is a custom NSURLSession delegate included?
    answer: NSURLSession follows redirects by default and NSMutableURLRequest has no boolean to disable that behaviour. The delegate declines the proposed request so a command without -L returns its original 3xx response.
  - question: Does the generated code use ARC-compatible APIs?
    answer: Yes. It uses Foundation objects, properties, blocks, and modern NSURLSession APIs without manual retain or release calls. The surrounding project should be compiled with ARC as current Apple projects normally are.
  - question: Can repeated headers be represented exactly?
    answer: NSMutableURLRequest comma-folds values added under one name. Because that is not equivalent for every field, duplicate names produce a controlled limitation rather than altered code.
related:
  - curl-to-swift
  - curl-to-swift/urlsession
  - curl-to-kotlin/okhttp
  - curl-to-dart/http
---

## NSURLSession in Objective-C

The generated snippet creates an `NSURL`, configures a mutable request, and
starts an `NSURLSessionDataTask` with a completion block. It checks the transport
error before decoding returned bytes as UTF-8.

Methods are assigned as strings, so custom HTTP verbs work without a switch over
known constants. Headers, cookies, and authorization are applied through
Foundation's request API.

## Redirect behaviour

A normal session follows redirects, the opposite of cURL without `-L`. The
generated `NoRedirects` delegate implements the task redirect callback and
passes `nil` to its completion handler. An `-L` request uses the shared session
and its follow behaviour.

## Request data and files

Serialized bodies become UTF-8 `NSData`. A file body uses
`dataWithContentsOfFile:` in the generated program. Multipart requests assemble
part headers, fields, file bytes, and a matching fixed boundary in
`NSMutableData`.

That multipart approach buffers the body. For very large uploads, integrate an
upload task or stream in the application. The converter remains static and
never reads the file itself.
