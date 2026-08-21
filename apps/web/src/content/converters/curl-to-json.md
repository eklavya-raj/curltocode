---
slug: curl-to-json
title: cURL to JSON Request Converter | CurlToCode
description: Convert cURL to a normalized JSON request document with ordered headers, queries, cookies, structured auth, discriminated body data, and redirect intent.
heading: Convert cURL to JSON
eyebrow: CurlToCode normalized request format
lede: Inspect the exact normalized HTTP request as portable JSON, including distinctions ordinary key-value request formats often discard.
language: json
client: request
languageLabel: JSON
clientLabel: request document
order: 109
faqs:
  - question: Is this a standard HTTP JSON format?
    answer: It is CurlToCode's documented normalized request representation, not a universal wire standard. Its purpose is to preserve semantics between parsers, generators, tests, and integrations.
  - question: Why are headers and query parameters arrays?
    answer: Arrays preserve ordering and duplicate names. A JSON object would keep only one value for a key and make a semantically faithful round trip impossible.
  - question: Can the JSON document be converted back to cURL?
    answer: Yes. A structurally valid request document is parsed locally, validated, and emitted as cURL without evaluating values or contacting the URL.
related:
  - curl-to-har
  - curl-to-postman
  - curl-to-http
  - json-to-curl
---

## The central request model

Every CurlToCode parser produces one normalized request before a generator runs.
This target exposes that model directly: method, URL, ordered headers and query
parameters, cookies, authentication, body, and request options.

Bodies are discriminated objects rather than one ambiguous string. JSON text,
plain text, form encoding, multipart parts, and binary file references remain
distinguishable for the next consumer.

## Fidelity over convenience

Headers, cookies, and query parameters are arrays because duplicate names can be
meaningful. Authentication remains structured. Redirect intent stays a boolean
option. These choices make the document more verbose than an ad hoc JSON object
and far safer to round-trip.

## Local validation in reverse

Code → cURL recognizes the shape and validates fields before creating output.
An unrelated JSON object receives an explanation of the required formats rather
than being guessed into a request. No value is executed, logged, or uploaded.
