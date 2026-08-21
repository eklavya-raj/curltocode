---
slug: curl-to-matlab
title: cURL to MATLAB HTTP Interface Converter | CurlToCode
description: Convert supported cURL commands to MATLAB HTTP RequestMessage code with methods, fields, exact payloads, authentication, and explicit client limitations.
heading: Convert cURL to MATLAB
eyebrow: MATLAB HTTP messages
lede: Generate matlab.net.http request objects for representable requests and report unsupported redirect, repeated-header, or multipart semantics precisely.
language: matlab
client: http
languageLabel: MATLAB
clientLabel: HTTP Interface
order: 99
faqs:
  - question: Why does the MATLAB target support fewer cURL cases?
    answer: RequestMessage offers a typed API, but stable high-level construction cannot reproduce every custom method, repeated field, redirect policy, or multipart detail. The converter prefers an explicit limitation to fragile generated code.
  - question: Are body bytes re-serialized?
    answer: No. Supported textual payloads are passed as message content from the original serialized value so formatting is not normalized unexpectedly.
  - question: Can MATLAB stop or follow redirects per request here?
    answer: The stable send surface does not expose a simple request-local switch equivalent to cURL -L, so cases whose policy cannot be kept are reported.
related:
  - curl-to-r
  - curl-to-julia
  - curl-to-python
  - curl-to-http
---

## A typed HTTP message

MATLAB's HTTP interface represents the method, fields, and body as message
objects rather than a loose options map. For supported inputs, the generator
constructs those values and sends the `RequestMessage` to the URI.

This API does not provide a reliable high-level representation for every cURL
feature. Custom verbs outside its stable method set, repeated names, multipart
uploads, and redirect-policy mismatches are surfaced rather than hidden.

## Why limitations are part of the output

Networking code that merely looks plausible is dangerous. If MATLAB would fold
a header, ignore `-L`, or require an application-specific multipart provider,
emitting a request anyway could contact the server with different semantics.

Supported serialized payloads remain exact text. Credentials and headers stay
local to the generated source, and the converter never calls MATLAB or the
represented endpoint.
