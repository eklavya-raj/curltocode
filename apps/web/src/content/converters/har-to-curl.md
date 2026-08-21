---
direction: code-to-curl
slug: har-to-curl
title: HAR to cURL Converter | CurlToCode
description: Convert HAR 1.2 and browser DevTools request exports to cURL locally, recovering methods, URLs, ordered headers, cookies, bodies, forms, and files.
heading: Convert HAR to cURL
eyebrow: Browser archive request extraction
lede: Paste a HAR archive, inspect its static request data, and turn the first entry into cURL without replaying any recorded traffic.
language: har
client: json
languageLabel: HAR
clientLabel: 1.2 archive
order: 212
faqs:
  - question: Which request is used when a HAR has many entries?
    answer: The interactive converter selects the first request deterministically. The library API can list every entry with its method and path so an application can present an explicit chooser.
  - question: How are Chrome HTTP/2 pseudo-headers handled?
    answer: Fields such as :authority are transport metadata, not ordinary user-settable request headers. They are excluded while normal ordered headers remain intact.
  - question: Does parsing a HAR replay its requests?
    answer: Never. The archive is treated as JSON data. CurlToCode does not fetch its URLs, resolve cookies, read referenced files, or execute page content.
related:
  - curl-to-har
  - postman-to-curl
  - json-to-curl
  - http-to-curl
---

## Browser-shaped HAR input

Real Chrome and DevTools exports contain a log, nested entries, response data,
timings, and HTTP/2 pseudo-headers. The parser validates the archive, visits its
request objects, and reads only request details relevant to cURL.

Ordered headers, cookies, query strings, raw post data, URL-encoded parameters,
and multipart parts are normalized. Duplicate cookie data appearing in both a
Cookie header and structured list is not emitted twice.

## Multi-request archives

A HAR commonly contains dozens of requests. The page chooses the first for a
predictable one-step conversion. Library consumers can call the entry-listing
API to show method and path labels and then choose an item deliberately.

## Gaps in the format

HAR records an exchange, not whether the originating client would follow a
future redirect. That policy cannot be reconstructed and is not fabricated.
Response and timing data do not affect the cURL request.

Everything is parsed locally; even a HAR containing real session cookies is not
uploaded.
