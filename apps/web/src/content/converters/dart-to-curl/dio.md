---
direction: code-to-curl
slug: dart-to-curl/dio
parent: dart-to-curl
title: Dio to cURL Command Converter | CurlToCode
description: Convert Dio requests into a cURL command, reading the data argument and the Options object carrying the method, headers, and followRedirects, plus FormData parts.
heading: Convert Dio to a cURL command
eyebrow: Dio parser
lede: Read a Dio call and recover the request, including a FormData built as a list of entries.
language: dart
client: dio
languageLabel: Dart
clientLabel: Dio
order: 1962
faqs:
  - question: Where does Dio keep the request policy?
    answer: In an Options object passed to the call. The method, the headers, and followRedirects all live there rather than as arguments to the request itself.
  - question: How is a FormData read?
    answer: "Both shapes are supported: fromMap, which keys the parts by name, and the list form built with fields.add, which is what keeps a repeated field name."
  - question: Does validateStatus affect the converted command?
    answer: No. It decides whether Dio throws on a non-2xx response, which changes nothing about the request, so it is read and dropped.
related:
  - dart-to-curl
  - dart-to-curl/http
  - curl-to-dart/dio
  - nodejs-to-curl/axios
---

## One call, one options object

`dio.request(url, data: ..., options: Options(...))` is the general form, and
the per-verb methods are the same call with the method filled in. Everything
that describes the request other than its payload sits inside `Options`.

That separation is why the reader looks in two places: the payload is an
argument to the call, and the method, headers, and redirect policy are
arguments to `Options`.

## FormData, both ways

`FormData.fromMap({...})` is the better-known constructor and keys its parts
by name. `FormData()` with `fields.add(MapEntry(name, value))` keeps them in
a list, which is the only shape that can hold the same name twice.

Both are read, and both come back as ordered multipart fields.

## Redirects

`followRedirects` is an `Options` field. Dio follows by default, so an
absent setting converts to a command with `-L`.
