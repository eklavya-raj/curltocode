---
direction: code-to-curl
slug: java-to-curl/httpurlconnection
parent: java-to-curl
title: HttpURLConnection to cURL Converter | CurlToCode
description: Convert Java HttpURLConnection code into a cURL command, reading its setters, repeated request properties, and the bytes written to its output stream.
heading: Convert HttpURLConnection to a cURL command
eyebrow: Core JDK parser
lede: Read the connection class that predates every Java HTTP client, where the request is configured by setters and fed through a stream.
language: java
client: httpurlconnection
languageLabel: Java
clientLabel: HttpURLConnection
order: 164
faqs:
  - question: Where does the request body come from?
    answer: From the write calls on the connection's output stream, joined in source order. A chunk the reader cannot resolve stops the conversion instead of truncating the body.
  - question: Can a repeated header name be recovered?
    answer: Yes. addRequestProperty appends rather than replaces, which is how HttpURLConnection sends the same field twice, and both values come back.
  - question: How is the redirect policy read?
    answer: From setInstanceFollowRedirects. Java follows redirects by default, so a connection that says nothing converts to a command with -L.
related:
  - java-to-curl
  - java-to-curl/httpclient
  - curl-to-java/httpurlconnection
  - nodejs-to-curl/https
---

## Setters, not a builder

The other three Java clients on this site are builders. `HttpURLConnection` is
not: it is a connection you configure in place and then write to. The reader
follows `setRequestMethod`, `setInstanceFollowRedirects`,
`addRequestProperty`, and `setRequestProperty`, and takes the URL from the
`URI` or `URL` the connection was opened from.

## The payload is a stream

There is no body parameter. Whatever the code writes to the output stream
before closing it is the payload, so the reader joins the `write` calls in
order. That is also how a multipart message written by hand comes back as its
fields, when the declared content type carries a boundary.

## setRequestProperty replaces, addRequestProperty appends

The distinction is preserved. A `setRequestProperty` for a name already
present replaces it, matching the JDK, so the recovered command carries the
headers the connection would actually send.
