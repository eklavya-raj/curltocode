---
slug: curl-to-scala
title: cURL to Scala sttp Converter | CurlToCode
description: Convert cURL to Scala sttp client code with repeated headers, exact bodies, redirects, authentication, multipart fields, file uploads, and custom methods.
heading: Convert cURL to Scala
eyebrow: sttp client 4 requests
lede: Generate typed sttp request builders with explicit methods, append-only headers, multipart parts, and a concrete synchronous backend.
language: scala
client: sttp
languageLabel: Scala
clientLabel: sttp
order: 101
faqs:
  - question: Can sttp preserve repeated request headers?
    answer: Yes. Calling header without replacement appends values, so repeated names remain separate entries in their original order.
  - question: Which backend does the example use?
    answer: The standalone output uses a concrete synchronous backend so it can run directly. The request builder can be reused with an async or effect-specific backend in an existing application.
  - question: How are multipart files represented?
    answer: Text uses multipart and local files use multipartFile, retaining the part name, submitted filename, and supported content type.
related:
  - curl-to-kotlin
  - curl-to-java
  - curl-to-clojure
  - curl-to-ocaml
---

## A typed request builder

sttp separates a request description from the backend that sends it. The
generated code starts with `basicRequest`, adds the exact method and URI,
appends headers, configures redirects, sets a body, and sends through a concrete
backend for a runnable example.

The builder's header calls preserve repeated names. Custom methods are expressed
as exact tokens rather than mapped to a nearby standard verb.

## Bodies and multipart forms

Serialized content is attached without a codec round trip. File bodies and
multipart files retain filesystem paths in the generated program. Native
multipart builders own their boundary and can keep the file metadata supplied
by cURL.

The dependency is `"com.softwaremill.sttp.client4" %% "core" % "4.0.26"`.
