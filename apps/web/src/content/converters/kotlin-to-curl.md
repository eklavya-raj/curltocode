---
direction: code-to-curl
slug: kotlin-to-curl
title: Kotlin to cURL – OkHttp & Ktor | CurlToCode
description: Convert Kotlin HTTP code into a cURL command. Reads OkHttp's Request.Builder and Ktor's HttpClient statically, including bodies, credentials, and redirects.
heading: Convert Kotlin to cURL
eyebrow: Kotlin HTTP parser
lede: Turn Kotlin request code into the cURL command it stands for, whether it was written with OkHttp or with Ktor.
language: kotlin
client: okhttp
languageLabel: Kotlin
clientLabel: OkHttp
order: 165
faqs:
  - question: Which Kotlin HTTP clients are supported?
    answer: OkHttp, through Request.Builder and its Kotlin extension functions, and Ktor's HttpClient, through the request call and the lambda that configures it.
  - question: Is the Kotlin compiled or run to work out the request?
    answer: No. The reader walks the source, so nothing is compiled, nothing runs, and the represented request never reaches a server.
  - question: Where does an OkHttp request keep its content type?
    answer: On the body rather than in a header. toRequestBody takes the media type as its argument, and that is the only place the type appears.
related:
  - kotlin-to-curl/okhttp
  - kotlin-to-curl/ktor
  - curl-to-kotlin
  - java-to-curl
---

## Two clients, two shapes

**[OkHttp](/kotlin-to-curl/okhttp)** is a builder chain, the same one Java uses,
with Kotlin extension functions replacing the static factory methods. The
request reads top to bottom: a URL, a method, a body, then headers.

**[Ktor](/kotlin-to-curl/ktor)** puts the request inside a trailing lambda.
The URL is an argument to `request`, and everything else — the method, the
headers, the body — is a statement in the block that follows.

## What Kotlin syntax costs a reader

Kotlin puts the media type on the body through `toRequestBody`, sets
credentials through `Credentials.basic`, and writes its redirect policy either
as a builder call or as a property assignment inside a configuration lambda.

Each of those is somewhere a naive reader would not look, and each is handled
here, because missing one would silently drop a real part of the request.

## Static and local

Conversion happens in your browser and reads the syntax rather than running it.
An expression that only exists at run time is reported, with its text quoted
back, instead of being replaced by a plausible value.
