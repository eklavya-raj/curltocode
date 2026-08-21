---
direction: code-to-curl
slug: kotlin-to-curl/ktor
parent: kotlin-to-curl
title: Ktor Client to cURL Converter | CurlToCode
description: Convert Ktor client code to a cURL command, reading the request lambda's method, header calls, setBody, form data, and the followRedirects configuration.
heading: Convert Ktor to a cURL command
eyebrow: Ktor parser
lede: Read a Ktor request block, where the URL is an argument and everything else is a statement inside the lambda.
language: kotlin
client: ktor
languageLabel: Kotlin
clientLabel: Ktor
order: 1652
faqs:
  - question: How is the method read?
    answer: From the HttpMethod value assigned inside the request lambda. Ktor takes the verb as data, so a custom method needs no special handling.
  - question: Where is the redirect policy set?
    answer: In the HttpClient configuration block, as a followRedirects property. Ktor follows by default, so an absent setting converts to a command with -L.
  - question: How does a multipart form convert?
    answer: The append calls inside the formData block become the form's fields, in order, so a repeated field name is preserved.
related:
  - kotlin-to-curl
  - kotlin-to-curl/okhttp
  - curl-to-kotlin/ktor
  - nodejs-to-curl/got
---

## A request in a block

`client.request(url) { ... }` is Ktor's general form. The URL is the argument;
the method, the headers, and the body are statements inside the trailing
lambda. That reads well and means a reader has to follow the block rather than
an argument list.

## Headers and body

`header(name, value)` adds one field at a time. `setBody` takes the payload,
and the content type comes from the header rather than from the body, which is
the opposite of [OkHttp](/kotlin-to-curl/okhttp).

## Configuration is separate

The client is configured once, at construction, and the request is configured
per call. `followRedirects` belongs to the client block, so the reader looks
there for it rather than in the request.
