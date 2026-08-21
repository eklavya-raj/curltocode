---
slug: curl-to-clojure
title: cURL to Clojure clj-http Converter | CurlToCode
description: Convert cURL to Clojure clj-http request maps with exact bodies, repeated headers, basic authentication, multipart forms, files, cookies, and redirects.
heading: Convert cURL to Clojure
eyebrow: Data-oriented JVM HTTP
lede: Generate a clj-http request as ordinary Clojure data, retaining repeated header values and multipart part order.
language: clojure
client: cljhttp
languageLabel: Clojure
clientLabel: clj-http
order: 93
faqs:
  - question: How are repeated headers represented in Clojure?
    answer: A header name maps to a vector when it has multiple values, which clj-http sends separately. A single value remains a string for readable output.
  - question: Does the output re-encode JSON?
    answer: No. The original serialized body is assigned directly, avoiding changes to whitespace, ordering, numeric spelling, or escapes.
  - question: Which dependency is generated?
    answer: The page targets clj-http 3.13.1 and provides the dependency coordinate in the result metadata.
related:
  - curl-to-java
  - curl-to-kotlin
  - curl-to-scala
  - curl-to-elixir
---

## Requests as Clojure maps

clj-http accepts a generic request map, so the generator can keep the method as
a keyword while placing the URL, headers, body, authentication, multipart parts,
and redirect flag in one inspectable value.

Repeated headers become vector values rather than being collapsed. Multipart
parts are a vector, preserving duplicate field names and their order.

## Serialized bodies and file parts

JSON, form, and text content remain their original strings. File bodies and
multipart files are represented with `clojure.java.io/file`; no local path is
opened during conversion.

For multipart requests, clj-http generates the boundary. The converted header
set therefore does not fight the encoder with an obsolete boundary copied from
another client.

## Redirect behaviour

`:follow-redirects` directly mirrors `-L`. The response map is returned even for
ordinary HTTP error statuses according to the generated options, keeping
request conversion separate from application-specific status handling.

Use `clj-http/clj-http {:mvn/version "3.13.1"}` in the project dependencies.
