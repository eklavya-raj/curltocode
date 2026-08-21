---
slug: curl-to-har
title: cURL to HAR 1.2 Converter | CurlToCode
description: Convert cURL to a HAR 1.2 JSON archive locally, preserving request methods, URLs, ordered headers, cookies, query values, text or form bodies, and files.
heading: Convert cURL to HAR
eyebrow: HTTP Archive request document
lede: Represent one cURL request as a valid HAR 1.2 log entry that browser tooling and archive-aware programs can inspect.
language: har
client: json
languageLabel: HAR
clientLabel: 1.2 archive
order: 108
faqs:
  - question: Does the generated HAR contain a real response?
    answer: No. CurlToCode never sends the represented request, so the response is an intentionally empty placeholder and timing or size fields use unknown values where the format requires them.
  - question: Can HAR preserve redirect following from curl -L?
    answer: A HAR request entry records one exchange, not the client's future redirect policy. The archive cannot encode that option, and round-trip checks exclude it rather than inventing metadata.
  - question: Can a browser-exported HAR be converted back to cURL?
    answer: Yes. The parser reads Chrome- and DevTools-shaped HAR logs, ignores HTTP/2 pseudo-headers, lists every entry for selection, and converts the first request by default.
related:
  - curl-to-json
  - curl-to-postman
  - curl-to-http
  - har-to-curl
---

## A request inside an archive

HAR 1.2 wraps requests in log entries alongside optional response and timing
data. Because conversion never performs the request, the generator fills only
request facts it actually knows and uses neutral placeholders for the response.

Headers and query values remain ordered arrays, so duplicate names survive.
Cookies use HAR's structured request cookie list. Text bodies and form parameters
map to `postData` without re-serializing their contents.

## What an archive cannot claim

A single source request has no measured start time, duration, response size,
server address, or TLS timing. The generator does not fabricate those facts.
Likewise, whether a client would follow a later redirect is not a property of
one request entry.

## Reading HAR back to cURL

The reverse parser recognizes the `log.version` and entries structure, handles
nested request data from browser exports, and discards HTTP/2 pseudo-headers that
are not valid user-settable HTTP/1 request fields.

For multi-entry logs, the public API can list each method and path. The simple
converter chooses the first request deterministically and never replays it.
