---
direction: code-to-curl
slug: dart-to-curl
title: Dart to cURL – package:http & Dio | CurlToCode
description: Convert Dart and Flutter HTTP code into a cURL command. Reads package:http requests and Dio calls statically, including headers, bodies, forms, and redirects.
heading: Convert Dart to cURL
eyebrow: Dart HTTP parser
lede: Turn Dart or Flutter request code into the cURL command it stands for, without running the app.
language: dart
client: http
languageLabel: Dart
clientLabel: package:http
order: 196
faqs:
  - question: Which Dart HTTP clients are supported?
    answer: package:http, through Request and MultipartRequest, and Dio, through its request call and the Options object that carries the request policy.
  - question: Does the reader handle single-quoted strings?
    answer: Yes. Dart's two quote styles behave identically, escapes included, and the reader treats them the same rather than favouring the double-quoted form.
  - question: Is any Dart executed?
    answer: No. The conversion is static and happens in your browser, so nothing is compiled and the represented request is never sent.
related:
  - dart-to-curl/http
  - dart-to-curl/dio
  - curl-to-dart
  - swift-to-curl
---

## Two clients, two habits

**[package:http](/dart-to-curl/http)** is the official package. Code creates a
`Request` and configures it through properties, which is why its facts arrive
as assignments rather than as arguments.

**[Dio](/dart-to-curl/dio)** takes everything as named arguments to one call,
with the method, the headers, and the redirect policy inside an `Options`
object.

## Named arguments carry the meaning

Dart names its arguments, and the names are what tell a body from a set of
options. The reader keeps those labels rather than reading by position, so a
call that omits an optional argument still reads correctly.

## Forms

`MultipartRequest` keys its fields by name, and Dio's `FormData` can hold
them as a list. That difference matters for a form with a repeated field name,
and each page says what its client can and cannot represent.
