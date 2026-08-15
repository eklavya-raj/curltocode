---
slug: curl-to-go/resty
parent: curl-to-go
title: cURL to Go Resty v3 Converter | CurlToCode
description: Convert cURL commands to Go Resty v3 code with raw bodies, duplicate headers, basic authentication, redirects, multipart fields, and file uploads.
heading: Convert cURL to Go Resty
eyebrow: Resty v3 for Go
lede: Generate concise Resty v3 requests while preserving the normalized request and calling out behavior the client configures differently from net/http.
language: go
client: resty
languageLabel: Go
clientLabel: Resty
order: 41
faqs:
  - question: Which Resty import path does the generated code use?
    answer: It uses the official Resty v3 vanity path resty.dev/v3. The dependency hint uses go get with the same path, so the source and module requirement stay aligned.
  - question: Does Resty preserve duplicate request headers?
    answer: Yes. The generated code appends values directly to request.Header with Add, using the underlying http.Header rather than Resty's single-value map helpers.
  - question: How are GET or DELETE bodies handled?
    answer: Resty disables those payloads by default. When the normalized request contains one, the generator opts in with the request-level allow-payload setting instead of dropping the body.
related:
  - curl-to-go
  - curl-to-python/requests
  - curl-to-java/okhttp
  - go-to-curl/resty
---

## Resty request construction

The output creates a Resty client, disables redirects when the original command
omits `-L`, and builds one request with `client.R()`. It executes through the
generic `Execute(method, url)` API, which means extension methods do not require
a separate convenience function.

Headers are added through the public `http.Header` on the request. This is
deliberate: `SetHeaders` takes a map and cannot represent duplicate names, while
`Header.Add` retains every value.

## Bodies, authentication, and multipart

Raw JSON, text, and form bodies go through `SetBody` as strings, preventing
Resty's JSON marshaller from changing their bytes. Basic credentials use
`SetBasicAuth`; bearer credentials and cookies remain ordinary headers.

Multipart text values use ordered form-data fields. Files are opened explicitly
and passed to `SetMultipartField` with their posted filename and content type.
The runtime generates the boundary, so an existing multipart `Content-Type`
header is rejected rather than paired with the wrong body.

## Resty-specific considerations

**Close the client.** Resty v3 owns transport resources, and the generated
program defers `client.Close()`.

**Resty follows redirects by default.** The generator installs
`NoRedirectPolicy` when `-L` is absent. With `-L`, the normal bounded policy is
left in place.

**Use middleware for application policy.** Retries, logging, and response
unmarshalling are intentionally absent because they are not represented by the
original cURL request and adding them would change behavior.
