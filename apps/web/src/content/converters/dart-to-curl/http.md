---
direction: code-to-curl
slug: dart-to-curl/http
parent: dart-to-curl
title: package:http to cURL Converter | CurlToCode
description: Convert Dart package:http code into a cURL command, reading Request and MultipartRequest properties, the headers map, the body, and the followRedirects flag.
heading: Convert package:http to a cURL command
eyebrow: package:http parser
lede: Read a Dart Request configured through its properties and recover the request it would send.
language: dart
client: http
languageLabel: Dart
clientLabel: package:http
order: 1961
faqs:
  - question: How is the URL found?
    answer: From the Uri.parse the Request was built with. The parsed URI is usually assigned above the request, and that binding is followed.
  - question: How does a multipart form convert?
    answer: MultipartRequest keeps its text parts in a fields map, and each subscript assignment becomes one field in the converted command.
  - question: Where is the redirect policy?
    answer: In the request's followRedirects property. package:http follows by default, so a request that says nothing converts to a command with -L.
related:
  - dart-to-curl
  - dart-to-curl/dio
  - curl-to-dart/http
  - swift-to-curl/urlsession
---

## Properties, not arguments

`http.Request(method, url)` takes only those two. Everything else is assigned
afterwards: `headers.addAll({...})`, `body`, `bodyBytes`, and
`followRedirects`. The reader collects those assignments and the constructor
into one request.

## Multipart

`http.MultipartRequest` swaps the body for a `fields` map and a `files`
list. Each `fields['name'] = 'value'` assignment becomes one part of the form.

Because `fields` is a map, the client cannot send the same field name twice —
the second assignment would replace the first. Code that needs a repeated name
uses [Dio](/dart-to-curl/dio) instead, whose form keeps its fields in a list.

## Bodies

`body` is a string and `bodyBytes` is a byte list; both are read through to
the payload. The content type comes from the headers map, as it does on the
wire.
